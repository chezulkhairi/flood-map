var DATASET_ID = 'ciwm29xyd00082tmocm5l6osb';
var DATASETS_BASE = 'https://api.mapbox.com/datasets/v1/chennaiflood/' + DATASET_ID + '/';
var DATASETS_ACCESS_TOKEN = 'sk.eyJ1IjoiY2hlbm5haWZsb29kIiwiYSI6ImNpaG9mOGljdTBibmN0aGo3NWR6Y3Q0aXQifQ.X73YugnJDlhZEhxz2X86WA';
var MAP_LAYERS;
var MAP_LOCATIONS;
var SELECTED_ROADS_SOURCE;

// Simple map
mapboxgl.accessToken = 'pk.eyJ1IjoicGxhbmVtYWQiLCJhIjoiemdYSVVLRSJ9.g3lbg_eN0kztmsfIPxa9MQ';
var map = new mapboxgl.Map({
  container: 'map', // container id
  style: 'mapbox://styles/planemad/cih4qzr0w0012awltzvpie7qa', //stylesheet location
  hash: true
});

//Supress Tile errors
map.off('tile.error', map.onError);

// Add zoom and rotation controls to the map.
map.addControl(new mapboxgl.Navigation());

map.on('style.load', function (e) {

  addSourcesAndLayers();

  $('#feature-count').toggleClass('loading');

    map.addLayer({
        'id': 'terrain-data',
        'type': 'line',
        'source': 'terrain-data',
        'source-layer': 'contour',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': '#ff69b4',
            'line-opacity': '0.3',
            'line-width': 1
        }
    });

  // Select flooded roads
    var featuresGeoJSON = {
        'type': 'FeatureCollection',
        'features': []
    };
    $('#feature-count').toggleClass('loading');
    function getFeatures(startID) {
        var url = DATASETS_BASE + 'features';
        var params = {
            'access_token': datasetsAccessToken
        };
        if (startID) {
            params.start = startID;
        }
        $.getJSON(url, params, function (data) {
            if (data.features.length > 0) {
                data.features.forEach(function (feature) {
                    feature.properties.id = feature.id;
                });
                featuresGeoJSON.features = featuresGeoJSON.features.concat(data.features);
                var lastFeatureID = data.features[data.features.length - 1].id;
                getFeatures(lastFeatureID);
                selectedRoadsSource.setData(featuresGeoJSON);
                updateFeatureCount(featuresGeoJSON);
            } else {
              updateFeatureCount(featuresGeoJSON);
              $('#feature-count').toggleClass('loading');
                playWithMap(featuresGeoJSON);
            }
        });
    }

    getFeatures(null);

  //Live query
    map.on('mousemove', function (e) {
        map.featuresAt(e.point, {
            radius: 4
        }, function (err, features) {
            if (err) throw err;

            var featuresList = '';
            if (features[0]) {
                if (features[0].properties.class)
                    featuresList += features[0].properties.class + ' ';
                if (features[0].properties.type)
                    featuresList += features[0].properties.type + '';
                if (features[0].properties.name)
                    featuresList += '- ' + features[0].properties.name;
                $('#map-query').html(featuresList);
            }
        });
    });

  //Popups on click
    map.on('click', function (e) {
        map.featuresAt(e.point, {
            radius: 10,
            layer: ['chennai-relief-camps', 'chennai-relief-camps-22nov'],
            includeGeometry: true
        }, function (err, features) {
            if (err) throw err;

            if (features.length > 0) {
                var popupHTML = '<h5>' + features[0].properties.Name + '</h5><p>' + $('[data-map-layer=' + features[0].layer.id + ']').html() + '</p>';
                var popup = new mapboxgl.Popup()
                                        .setLngLat(features[0].geometry.coordinates)
                                        .setHTML(popupHTML)
                                        .addTo(map);
            }
        });
    });

  // Update map legend from styles
  $('[data-map-layer]').each(function () {
      // Get the color of the feature from the map
      var obj = $(this).attr('data-map-layer');

      try {
          var color = map.getPaintProperty(obj, 'circle-color');
          // Set the legend color
          $(this).prepend('<div class="map-legend-circle" style="background:"' + array2rgb(color) + '></div>');
      } catch (e) {
          return;
      }
  });

    function playWithMap(data) {
        var addedRoads = [];
        var addedFeatures = [];

        //Dump Data
        window.dump = JSON.stringify(data);

        for (var i = 0; i < data.features.length; i++) {
            addedRoads.push(data.features[i].properties.id);
            addedFeatures.push(data.features[i]);
        }


        map.on('click', function (e) {
            if (map.getZoom() >= 15) {
                //Check if the feature clicked on is in the selected Roads Layer.
                //If yes, UNSELECT the road
                map.featuresAt(e.point, {radius: 5, includeGeometry: true, layer: 'selected-roads'}, function (err, features) {
                    if (err) throw err;

                    if (features.length > 0) {

                        $('#map').toggleClass('loading');
                        var saveURL = DATASETS_BASE + 'features/' + features[0].properties.id + '?access_token=' + datasetsAccessToken;

                        var index = addedRoads.indexOf(features[0].properties.id);
                        $.ajax({
                            'method': 'DELETE',
                            'url': saveURL,
                            'contentType': 'application/json',
                            'success': function () {
                                $('#map').toggleClass('loading');
                                data['features'].splice(index, 1);
                                addedRoads.splice(index, 1);
                                addedFeatures.splice(index, 1);
                                selectedRoadsSource.setData(data);
                                updateFeatureCount(data);
                            },
                            'error': function () {
                                $('#map').toggleClass('loading');
                            }
                        });
                    } else {
                        //If road is not present in the `selected-roads` layer,
                        //check the glFeatures layer to see if the road is present.
                        //If yes,ADD it to the `selected-roads` layer
                        map.featuresAt(e.point, {radius: 5, includeGeometry: true, layer: mapLayerCollection['road']}, function (err, glFeatures) {
                            if (err) throw err;

                            var tempObj = {
                                'type': 'Feature'
                            };

                            tempObj.geometry = glFeatures[0].geometry;
                            tempObj.properties = glFeatures[0].properties;
                            tempObj.properties['is_flooded'] = true;
                            tempObj.properties['timestamp'] = Date.now();

                            $('#map').toggleClass('loading');

                            var id = md5(JSON.stringify(tempObj));
                            tempObj.id = id;
                            var saveURL = DATASETS_BASE + 'features/' + id + '?access_token=' + datasetsAccessToken;

                            $.ajax({
                                'method': 'PUT',
                                'url': saveURL,
                                'data': JSON.stringify(tempObj),
                                'dataType': 'json',
                                'contentType': 'application/json',
                                'success': function (response) {
                                    $('#map').toggleClass('loading');
                                    tempObj.id = response.id;
                                    tempObj.properties.id = response.id;
                                    addedFeatures.push(tempObj);
                                    data.features.push(tempObj);
                                    addedRoads.push(glFeatures[0].properties.osm_id);
                                    selectedRoadsSource.setData(data);
                                    updateFeatureCount(data);
                                },
                                'error': function () {
                                    $('#map').toggleClass('loading');
                                }
                            });
                        });
                    }
                });
            }
        });
    }
});
  //Update feature count
function updateFeatureCount(data) {
    var count = data.features.length;
    $('#feature-count').html(count);
}

function array2rgb(color) {
    // Combine and return the values
    return 'rgba(' + color.map(function (x) {
        return x * 255;
    }).join() + ')';
}

$(function () {
    $('#sidebar').mCustomScrollbar({
        theme: 'rounded-dots',
        scrollInertia: 100,
        callbacks: {
            onInit: function () {
                $('#sidebar').css('overflow', 'auto');
            }
        }
    });
});
