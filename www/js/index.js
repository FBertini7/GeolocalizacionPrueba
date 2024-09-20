document.addEventListener('deviceready', async function() {
    await inicializarBaseDeDatos();
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
let db;

async function crearMapaLeaflet(online = true) {
    const ubicacionActual = await obtenerUbicacionActual();
    if(online) {
        gLeafletMap = crearMapaLeafletOnline(ubicacionActual.latitude, ubicacionActual.longitude);
        await db.tiles?.clear();
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
    const tile = {
        "id": `${z}-${x}-${y}`,
        "blob": blob
    };
    guardarDatosEnDB(tile);
}

function latLngToTile(lat, lng, zoom) {
    var tileX = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
    var tileY = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x: tileX, y: tileY };
}

class OfflineTileLayer extends L.TileLayer {
   createTile(coords, done) {
        var tile = document.createElement('img');

		tile.addEventListener('load', () => this._tileOnLoad(done, tile));
		tile.addEventListener('error', () => this._tileOnError(done, tile));

		if (this.options.crossOrigin || this.options.crossOrigin === '') {
			tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
		}

		if (typeof this.options.referrerPolicy === 'string') {
			tile.referrerPolicy = this.options.referrerPolicy;
		}

		tile.alt = '';

		loadTileFromIndexedDB(coords.z, coords.x, coords.y).then(url => {
            tile.src = url;
        });

		return tile;
   }
}

async function loadTileFromIndexedDB(z, x, y) {
    try {
        const tileData = await db.tiles.get(`${z}-${x}-${y}`);
        if (tileData) {
            return URL.createObjectURL(tileData.blob);
        } else {
            throw new Error('No se encontró el tile.');
        }
    } catch(error) {
        console.error('Error al cargar tile desde DB: ', error);
    }
}

async function crearMapaLeafletOffline(lat, lng) {
    gLeafletMap = L.map('map').setView([lat, lng], 14);
    const offlineTileLayer = new OfflineTileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: 13,
        maxZoom: 16,
    });
    gLeafletMap.addLayer(offlineTileLayer);

    L.marker([lat, lng]).addTo(gLeafletMap)
        .bindPopup('Usted está aquí')
        .openPopup();
}

async function inicializarBaseDeDatos() {
    try {
        db = new Dexie('tilesDB');
        db.version(1).stores({
            tiles: 'id,blob'
        });
        await db.open();
        console.log("Base de datos cargada correctamente.");
    } catch (error) {
        console.error("Error al cargar la base de datos:", error);
    }
}

function guardarDatosEnDB(datos) {
    db.tiles.put(datos);
};

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