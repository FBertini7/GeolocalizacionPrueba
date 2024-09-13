document.addEventListener('deviceready', async function() {

}, false);

document.getElementById('googleMaps').addEventListener('click', async () => {
    await crearMapaGoogleMaps();
});

document.getElementById('leaflet').addEventListener('click', async () => {
    await crearMapaLeaflet(await verificarConexion());
});

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
        gLeafletMap?.remove();
        gLeafletMap = crearMapaLeafletOnline(ubicacionActual.latitude, ubicacionActual.longitude);
        calcularRutaLeaflet(gLeafletMap, ubicacionActual.latitude, ubicacionActual.longitude, -34.591707, -58.372316, [{lat: -34.598374, lng: -58.368144}]);
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

function calcularRutaLeaflet(leafletMap, latOrigen, lngOrigen, latDestino, lngDestino, paradas = []) {
    const origen = L.latLng(latOrigen, lngOrigen);
    const stops = paradas.map(p => L.latLng(p.lat, p.lng));
    const destino = L.latLng(latDestino, lngDestino);
    L.Routing.control({
        waypoints: [
            origen,
            ...stops,
            destino
        ]
    }).addTo(leafletMap);
}

function crearMapaLeafletOffline(lat, lng) {

}

function obtenerUbicacionActual() {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition((posicion) => {
            console.log(posicion.coords);
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
