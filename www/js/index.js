document.addEventListener('deviceready', async function() {
    await crearMapaLeaflet(await verificarConexion());
}, false);

// Google Maps API (requiere de conexión)
async function crearMapaGoogleMaps() {
    const mapa = document.getElementById('map');
    const ubicacionActual = await obtenerUbicacionActual();
    const googleMap = initMap(mapa, ubicacionActual.latitude, ubicacionActual.longitude);
    calcularRutaGoogleMaps(googleMap, ubicacionActual.latitude, ubicacionActual.longitude, -34.591707, -58.372316, [{lat: -34.598374, lng: -58.368144}]);
}

function initMap(mapa, lat, lng) {
    const userLocation = { lat: lat, lng: lng };

    const googleMap = new google.maps.Map(mapa, {
        center: userLocation,
        zoom: 14,
        mapTypeId: "satellite"
    });

    new google.maps.Marker({
        position: userLocation,
        map: googleMap,
        title: "Ubicación actual"
    });

    return googleMap;
}

function calcularRutaGoogleMaps(googleMap, latOrigen, lngOrigen, latDestino, lngDestino, paradas = []) {
    const directionsService = new google.maps.DirectionsService();
    const directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(googleMap);
    const origen = new google.maps.LatLng(latOrigen, lngOrigen);
    const destino = new google.maps.LatLng(latDestino, lngDestino);
    const request = {
        origin: origen,
        destination: destino,
        travelMode: 'DRIVING',
        optimizeWaypoints: true,
        waypoints: paradas.map(p => ({
            location: p,
            stopover: true
        }))
    };
    directionsService.route(request, function(result, status) {
        if (status === google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
        } else {
            console.log("Error al calcular la ruta: " + status);
        }
    });
}

// Librería Leaflet
let gLeafletMap;

async function crearMapaLeaflet(online = true) {
    const ubicacionActual = await obtenerUbicacionActual();
    if(online) {
        gLeafletMap = crearMapaLeafletOnline(ubicacionActual.latitude, ubicacionActual.longitude);
        await downloadMapTiles(ubicacionActual.latitude, ubicacionActual.longitude);
    } else {
        crearMapaLeafletOffline(ubicacionActual.latitude, ubicacionActual.longitude);
    }
}

function crearMapaLeafletOnline(lat, lng) {
    const userLocation = { lat: lat, lng: lng };

    var leafletMap = L.map('map').setView([userLocation.lat, userLocation.lng], 14);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(leafletMap);

    L.marker([userLocation.lat, userLocation.lng]).addTo(leafletMap)
        .bindPopup('Usted está aquí')
        .openPopup();

    return leafletMap;
}

async function downloadMapTiles(lat, lng) {
    var url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    // Definir un área para descargar alrededor de la ubicación actual
    var tileRadius = 2; // Radio de tiles alrededor de la ubicación actual (ajustable)

    for (var z = 13; z <= 16; z++) { // Niveles de zoom
        var centerTile = latLngToTile(lat, lng, z);

        // Definir los límites de x y y para descargar un área alrededor de la ubicación actual
        var minX = Math.max(centerTile.x - tileRadius, 0);
        var maxX = Math.min(centerTile.x + tileRadius, Math.pow(2, z) - 1);
        var minY = Math.max(centerTile.y - tileRadius, 0);
        var maxY = Math.min(centerTile.y + tileRadius, Math.pow(2, z) - 1);

        for (var x = minX; x <= maxX; x++) {
            for (var y = minY; y <= maxY; y++) {
                var tileUrl = url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
                await downloadTile(tileUrl, z, x, y);
            }
        }
    }
}

async function downloadTile(tileUrl, z, x, y) {
    try {
        const response = await fetch(tileUrl);
        const blob = await response.blob();
        await saveTileToIndexedDB(z, x, y, blob);
    } catch (error) {
        console.log("Error al descargar el tile: ", error);
    }
}

async function saveTileToIndexedDB(z, x, y, blob) {
    return new Promise((resolve, reject) => {
        var request = indexedDB.open('tilesDB', 1);

        request.onupgradeneeded = function (event) {
            var db = event.target.result;
            db.createObjectStore('tiles', { keyPath: 'id' });
        };

        request.onsuccess = function (event) {
            var db = event.target.result;
            var transaction = db.transaction('tiles', 'readwrite');
            var objectStore = transaction.objectStore('tiles');

            var tile = {
                id: `${z}-${x}-${y}`,
                blob: blob
            };

            var request = objectStore.put(tile);

            request.onsuccess = function () {
                resolve();
            };

            request.onerror = function (e) {
                reject(e);
            };
        };

        request.onerror = function (e) {
            reject(e);
        };
    });
}

function latLngToTile(lat, lng, zoom) {
    var tileX = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
    var tileY = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x: tileX, y: tileY };
}

function crearMapaLeafletOffline(lat, lng) {
    gLeafletMap = L.map('map').setView([lat, lng], 14);

    L.tileLayer('', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        noWrap: true,
        bounds: [[-90, -180], [90, 180]],
        tileLoadError: function (e) {
            e.tile.src = 'img/error-tile.png'; // Tile de error si no se encuentra el tile
        }
    }).on('tileload', function (event) {
        var tile = event.tile;
        var coords = tile.coords;
        loadTileFromIndexedDB(coords.z, coords.x, coords.y, function (dataURL) {
            if (dataURL) {
                tile.src = dataURL;
            } else {
                tile.src = 'img/error-tile.png'; // Tile de error en caso de que no se pueda cargar
            }
        });
    }).addTo(gLeafletMap);

    L.marker([lat, lng]).addTo(gLeafletMap)
        .bindPopup('Usted está aquí')
        .openPopup();
}

function loadTileFromIndexedDB(z, x, y, callback) {
    var request = indexedDB.open('tilesDB', 1);

    request.onsuccess = function (event) {
        var db = event.target.result;
        var transaction = db.transaction('tiles', 'readonly');
        var objectStore = transaction.objectStore('tiles');

        var request = objectStore.get(`${z}-${x}-${y}`);

        request.onsuccess = function (event) {
            var result = event.target.result;
            if (result) {
                var reader = new FileReader();
                reader.onloadend = function () {
                    var dataURL = reader.result;
                    callback(dataURL);
                };
                reader.readAsDataURL(result.blob);
            } else {
                callback(null);
            }
        };

        request.onerror = function (e) {
            callback(null);
        };
    };

    request.onerror = function (e) {
        callback(null);
    };
}

function obtenerUbicacionActual() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition((posicion) => {
            resolve(posicion.coords);
        }, (error) => {
            reject(error);
        }, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        });
    })
}

async function verificarConexion() {
    return fetch('https://www.google.com/generate_204', { mode: 'no-cors' })
        .then(() => true)
        .catch(() => false);
}