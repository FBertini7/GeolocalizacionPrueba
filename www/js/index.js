let gLeafletMap;
let db;
const mapConfig = {
    defaultZoom: 14,
    minZoom: 13,
    maxZoom: 16,
    radioDescarga: 2
}

document.addEventListener('deviceready', async function() {
    await inicializarIndexedDB();
    await crearMapa(await verificarConexion());
}, false);

document.getElementById('ruta').addEventListener('click', async function () {
    const ubicacionActual = await obtenerUbicacionActual();
    calcularRutaOptima(ubicacionActual.latitude, ubicacionActual.longitude, -34.591707, -58.372316, [{lat: -34.598374, lng: -58.368144}])
})

async function crearMapa(online) {
    const ubicacionActual = await obtenerUbicacionActual();
    if(online) {
        await db.tiles?.clear();
        await descargarMapTiles(ubicacionActual.latitude, ubicacionActual.longitude);
    }

    gLeafletMap = L.map('map');

    gLeafletMap.setView([ubicacionActual.latitude, ubicacionActual.longitude], mapConfig.defaultZoom);

    const tileLayer = new customTileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: mapConfig.minZoom,
        maxZoom: mapConfig.maxZoom
    });
    gLeafletMap.addLayer(tileLayer);

    L.marker([ubicacionActual.latitude, ubicacionActual.longitude]).addTo(gLeafletMap)
        .bindPopup('Usted está aquí')
        .openPopup();
}

async function descargarMapTiles(lat, lng) {
    var url = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    var radio = mapConfig.radioDescarga;

    for (var z = mapConfig.minZoom; z <= mapConfig.maxZoom; z++) {
        var centro = latLngToTile(lat, lng, z);

        var minX = Math.max(centro.x - radio, 0);
        var maxX = Math.min(centro.x + radio, Math.pow(2, z) - 1);
        var minY = Math.max(centro.y - radio, 0);
        var maxY = Math.min(centro.y + radio, Math.pow(2, z) - 1);

        for (var x = minX; x <= maxX; x++) {
            for (var y = minY; y <= maxY; y++) {
                var tileUrl = url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
                await descargarTile(tileUrl, z, x, y);
            }
        }
    }
}

async function descargarTile(tileUrl, z, x, y) {
    try {
        const response = await fetch(tileUrl);
        const blob = await response.blob();
        await guardarTileEnIndexedDB(z, x, y, blob);
    } catch (error) {
        console.log("Error al descargar el tile: ", error);
    }
}

async function guardarTileEnIndexedDB(z, x, y, blob) {
    const tile = {
        "id": `${z}-${x}-${y}`,
        "blob": blob
    };
    db.tiles.put(tile);
}

async function cargarTileDeIndexedDB(z, x, y) {
    try {
        const tileData = await db.tiles.get(`${z}-${x}-${y}`);
        if (tileData) {
            return URL.createObjectURL(tileData.blob);
        } else {
            throw new Error('No se encontró el tile.');
        }
    } catch(error) {
        console.error('Error al cargar tile desde DB: ', error.message);
    }
}

async function inicializarIndexedDB() {
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

function latLngToTile(lat, lng, zoom) {
    var tileX = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
    var tileY = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x: tileX, y: tileY };
}

function calcularDistancia(latOrigen, lngOrigen, latDestino, lngDestino) {
    const R = 6371;
    const difLat = (latDestino - latOrigen) * Math.PI / 180;
    const difLon = (lngDestino - lngOrigen) * Math.PI / 180;
    const a =
        Math.sin(difLat / 2) * Math.sin(difLat / 2) +
        Math.cos(latOrigen * Math.PI / 180) * Math.cos(latDestino * Math.PI / 180) *
        Math.sin(difLon / 2) * Math.sin(difLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distancia = R * c;
    return distancia;
}

class customTileLayer extends L.TileLayer {
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

        verificarConexion().then(online => {
            if(online) {
                tile.src = this.getTileUrl(coords);
            } else {
                cargarTileDeIndexedDB(coords.z, coords.x, coords.y).then(url => {
                    tile.src = url;
                });
            }
        });

		return tile;
   }
}

L.Routing.CustomRouter = L.Class.extend({
    initialize: function(options) {
        this.options = options || {};
        this.routerOnline = L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1'
        });
    },

    route: async function(waypoints, callback, context, options) {
        if (await verificarConexion()) {
            this.routerOnline.route(waypoints, async (err, rutas) => {
                if (!err) {
                    guardarRuta(rutas[0]);
                    callback.call(context, null, rutas);
                } else {
                    console.error('Error al obtener ruta en línea:', err);
                }
            }, options);
        } else {
            const ultimaRuta = cargarRuta();
            if (ultimaRuta) {
                const ruta = {
                    ...ultimaRuta,
                    coordinates: ultimaRuta.coordinates.map(coord => L.latLng(coord.lat, coord.lng)),
                    inputWaypoints: ultimaRuta.inputWaypoints.map(iWp => ({
                        options: iWp.options,
                        latLng: L.latLng(iWp.latLng.lat, iWp.latLng.lng)
                    })),
                    waypoints: ultimaRuta.waypoints.map(wp => ({
                        options: wp.options,
                        latLng: L.latLng(wp.latLng.lat, wp.latLng.lng)
                    }))
                }
                callback.call(context, null, [ruta]);
            } else {
                callback.call(context, new Error('No hay rutas almacenadas disponibles.'), null);
            }
        }
    }
});

async function calcularRutaOptima(latOrigen, lngOrigen, latDestino, lngDestino, paradas = []) {
    const origen = L.latLng(latOrigen, lngOrigen);
    const stops = paradas.map(p => L.latLng(p.lat, p.lng));
    const destino = L.latLng(latDestino, lngDestino);
    L.Routing.control({
        router: new L.Routing.CustomRouter(),
        waypoints: [
            origen,
            ...stops,
            destino
        ]
    }).addTo(gLeafletMap);
}

function guardarRuta(ruta) {
    localStorage.setItem('ultimaRuta', JSON.stringify(ruta));
}

function cargarRuta() {
    const data = localStorage.getItem('ultimaRuta');
    if (data) return JSON.parse(data);
    else return null;
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