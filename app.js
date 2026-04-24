// =============================
// MAPA
// =============================
var map = L.map("map", {
  zoomControl: true
}).setView([4.538, -75.681], 13);

// =============================
// MAPAS BASE
// =============================
var osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

var satelite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "Tiles © Esri"
  }
);

var topo = L.tileLayer(
  "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  {
    attribution: "© OpenTopoMap contributors"
  }
);

L.control.scale({ imperial: false }).addTo(map);

// =============================
// LEYENDA
// =============================
var leyenda = L.control({ position: "bottomright" });

leyenda.onAdd = function () {
  var div = L.DomUtil.create("div", "leyenda");

  div.innerHTML =
    "<h4>Agresiones</h4>" +
    '<span style="background:#fe1900"></span> Exposición grave<br>' +
    '<span style="background:#fdae61"></span> Exposición leve<br>' +
    '<span style="background:#66bd63"></span> No exposición<br><br>' +
    "<h4>Servicios</h4>" +
    "🏥 Hospital<br>" +
    "🐶 Veterinaria<br><br>" +
    "<h4>Proximidad</h4>" +
    '<span style="background:#2b8cbe"></span> Centro / radio';

  return div;
};

leyenda.addTo(map);

// =============================
// VARIABLES GLOBALES
// =============================
var capaAgresiones = null;
var capaVeterinarias = null;
var capaHospitales = null;
var controlCapas = null;

var datosAgresiones = null;
var datosVeterinarias = null;
var datosHospitales = null;

var soloGravesActivo = false;
var hospitalesVisibles = true;
var veterinariasVisibles = true;
var modoRadioActivo = false;

// Proximidad
var puntoAnalisis = null;
var marcadorAnalisis = null;
var circuloAnalisis = null;
var totalDentroRadio = 0;

// Panel móvil
var panelMobileAbierto = false;

// =============================
// UTILIDADES
// =============================
function normalizarValor(valor) {
  if (Array.isArray(valor)) valor = valor[0];
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function hacerZoomACapaAgresiones() {
  if (capaAgresiones && capaAgresiones.getLayers().length > 0) {
    map.fitBounds(capaAgresiones.getBounds(), {
      padding: [30, 30],
      maxZoom: 15
    });
  }
}

function limpiarClave(valor) {
  return String(valor || "")
    .replace(/^\d+_/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function obtenerPropiedad(props, nombres) {
  props = props || {};

  for (var i = 0; i < nombres.length; i++) {
    if (Object.prototype.hasOwnProperty.call(props, nombres[i])) {
      return props[nombres[i]];
    }
  }

  var claves = Object.keys(props);
  var objetivos = nombres.map(limpiarClave);

  for (var j = 0; j < claves.length; j++) {
    var claveLimpia = limpiarClave(claves[j]);

    for (var k = 0; k < objetivos.length; k++) {
      if (claveLimpia === objetivos[k] || claveLimpia.endsWith(objetivos[k])) {
        return props[claves[j]];
      }
    }
  }

  return "";
}

function escaparHTML(valor) {
  return normalizarValor(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function valorTipoExposicion(feature) {
  return normalizarValor(obtenerPropiedad(feature.properties, [
    "TIPO_DE_EXPOSICION",
    "2_TIPO_DE_EXPOSICION",
    "Tipo de exposición",
    "Tipo_de_exposicion",
    "tipo_exposicion"
  ]));
}

function valorMunicipio(feature) {
  return normalizarValor(obtenerPropiedad(feature.properties, [
    "Municipio",
    "10_Municipio"
  ]));
}

function valorEspecie(feature) {
  return normalizarValor(obtenerPropiedad(feature.properties, [
    "Especie",
    "14_Especie"
  ]));
}

function valorFechaAgresion(feature) {
  return normalizarValor(obtenerPropiedad(feature.properties, [
    "Fecha_de_agresin",
    "Fecha_de_agresión",
    "Fecha_de_agresion",
    "6_Fecha_de_agresin",
    "6_Fecha_de_agresión",
    "6_Fecha_de_agresion"
  ]));
}

function valorDireccion(feature) {
  return normalizarValor(obtenerPropiedad(feature.properties, [
    "Direccin",
    "Dirección",
    "Direccion",
    "13_Direccin",
    "13_Dirección",
    "13_Direccion"
  ]));
}

function valorTipoLocalizacion(feature) {
  return normalizarValor(obtenerPropiedad(feature.properties, [
    "Tipo_de_localizaci",
    "Tipo_de_localización",
    "Tipo_de_localizacion",
    "9_Tipo_de_localizaci",
    "9_Tipo_de_localización",
    "9_Tipo_de_localizacion"
  ]));
}

function valorObservaciones(feature) {
  return normalizarValor(obtenerPropiedad(feature.properties, [
    "Observaciones",
    "22_Observaciones"
  ]));
}

function colorPorAgresion(valor) {
  valor = normalizarValor(valor).toLowerCase();

  if (valor === "exposición grave" || valor === "exposicion grave") return "#fe1900";
  if (valor === "exposición leve" || valor === "exposicion leve") return "#fdae61";
  if (valor === "no exposición" || valor === "no exposicion") return "#66bd63";

  return "#66bd63";
}

function poblarSelect(id, valores, textoTodos) {
  var select = document.getElementById(id);
  if (!select) return;

  select.innerHTML = '<option value="">' + textoTodos + "</option>";

  valores.forEach(function (valor) {
    var option = document.createElement("option");
    option.value = valor;
    option.textContent = valor;
    select.appendChild(option);
  });
}

function actualizarContador(total) {
  var contador = document.getElementById("contadorResultados");
  if (!contador) return;

  if (modoRadioActivo && puntoAnalisis) {
    contador.textContent =
      "Casos visibles: " + total + " | Dentro del radio: " + totalDentroRadio;
  } else {
    contador.textContent = "Casos visibles: " + total;
  }
}

function actualizarEstadoProximidad(texto) {
  var estado = document.getElementById("estadoProximidad");
  if (estado) {
    estado.textContent = texto;
  }
}

function obtenerRadioActual() {
  return Number(document.getElementById("filtroRadio").value);
}

function actualizarTextoRadio() {
  var span = document.getElementById("valorRadio");
  if (span) {
    span.textContent = obtenerRadioActual();
  }
}

function actualizarTextoBotones() {
  var btnSoloGraves = document.getElementById("btnSoloGraves");
  var btnToggleHospitales = document.getElementById("btnToggleHospitales");
  var btnToggleVeterinarias = document.getElementById("btnToggleVeterinarias");
  var btnModoRadio = document.getElementById("btnModoRadio");

  if (btnSoloGraves) {
    btnSoloGraves.textContent = soloGravesActivo ? "Ver todos" : "Solo graves";
  }

  if (btnToggleHospitales) {
    btnToggleHospitales.textContent = hospitalesVisibles
      ? "Ocultar hospitales"
      : "Mostrar hospitales";
  }

  if (btnToggleVeterinarias) {
    btnToggleVeterinarias.textContent = veterinariasVisibles
      ? "Ocultar veterinarias"
      : "Mostrar veterinarias";
  }

  if (btnModoRadio) {
    btnModoRadio.textContent = modoRadioActivo ? "Desactivar radio" : "Activar radio";
    btnModoRadio.classList.toggle("activo", modoRadioActivo);
  }

  map.getContainer().style.cursor = modoRadioActivo ? "crosshair" : "";
}

function obtenerLatLngDeFeature(feature) {
  if (!feature || !feature.geometry) return null;

  if (
    feature.geometry.type === "Point" &&
    Array.isArray(feature.geometry.coordinates)
  ) {
    var coords = feature.geometry.coordinates;
    var lng = Number(coords[0]);
    var lat = Number(coords[1]);

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return L.latLng(lat, lng);
    }
  }

  return null;
}

function crearPopupAgresion(feature) {
  var tipo = valorTipoExposicion(feature) || "Sin clasificación";
  var municipio = valorMunicipio(feature) || "Sin dato";
  var especie = valorEspecie(feature) || "Sin dato";
  var fechaAgresion = valorFechaAgresion(feature) || "Sin dato";
  var direccion = valorDireccion(feature) || "Sin dato";
  var tipoLocalizacion = valorTipoLocalizacion(feature) || "Sin dato";

  return (
    '<div class="popup-aptr">' +
    "<b>" + escaparHTML(tipo) + "</b><br>" +
    "Municipio: " + escaparHTML(municipio) + "<br>" +
    "Especie: " + escaparHTML(especie) + "<br>" +
    "Fecha de agresión: " + escaparHTML(fechaAgresion) + "<br>" +
    "Dirección: " + escaparHTML(direccion) + "<br>" +
    "Tipo de localización: " + escaparHTML(tipoLocalizacion) +
    "</div>"
  );
}

function crearPopupServicio(feature, tipoServicio) {
  var p = feature.properties || {};
  var nombre = normalizarValor(p.name) || tipoServicio;
  return "<b>" + escaparHTML(nombre) + "</b>";
}

// =============================
// PROXIMIDAD
// =============================
function limpiarAnalisisProximidad() {
  puntoAnalisis = null;
  totalDentroRadio = 0;

  if (marcadorAnalisis) {
    map.removeLayer(marcadorAnalisis);
    marcadorAnalisis = null;
  }

  if (circuloAnalisis) {
    map.removeLayer(circuloAnalisis);
    circuloAnalisis = null;
  }

  actualizarControlCapas();
}

function actualizarGeometriaAnalisis() {
  if (!puntoAnalisis) return;

  var radio = obtenerRadioActual();

  if (marcadorAnalisis) {
    map.removeLayer(marcadorAnalisis);
  }

  if (circuloAnalisis) {
    map.removeLayer(circuloAnalisis);
  }

  marcadorAnalisis = L.marker(puntoAnalisis, {
    icon: L.divIcon({
      html: "📍",
      className: "icono-analisis",
      iconSize: [28, 28],
      iconAnchor: [14, 28]
    })
  }).addTo(map);

  circuloAnalisis = L.circle(puntoAnalisis, {
    radius: radio,
    color: "#2b8cbe",
    weight: 2,
    fillColor: "#2b8cbe",
    fillOpacity: 0.10
  }).addTo(map);

  actualizarEstadoProximidad(
    "Centro de análisis: " +
      puntoAnalisis.lat.toFixed(5) +
      ", " +
      puntoAnalisis.lng.toFixed(5) +
      " | Radio: " +
      radio +
      " m"
  );

  actualizarControlCapas();
}

function definirPuntoAnalisis(latlng) {
  puntoAnalisis = latlng;
  actualizarGeometriaAnalisis();
  aplicarFiltros();
}

// =============================
// PANEL MÓVIL
// =============================
function esMovil() {
  return window.innerWidth <= 640;
}

function abrirPanelMobile() {
  if (!esMovil()) return;

  var panel = document.getElementById("panel-filtros");
  var boton = document.getElementById("btnTogglePanelMobile");

  panel.classList.add("abierto");
  panelMobileAbierto = true;

  if (boton) {
    boton.setAttribute("aria-expanded", "true");
  }

  setTimeout(function () {
    map.invalidateSize();
  }, 260);
}

function cerrarPanelMobile() {
  var panel = document.getElementById("panel-filtros");
  var boton = document.getElementById("btnTogglePanelMobile");

  panel.classList.remove("abierto");
  panelMobileAbierto = false;

  if (boton) {
    boton.setAttribute("aria-expanded", "false");
  }

  setTimeout(function () {
    map.invalidateSize();
  }, 260);
}

function alternarPanelMobile() {
  if (panelMobileAbierto) {
    cerrarPanelMobile();
  } else {
    abrirPanelMobile();
  }
}

function cerrarPanelSiMovil() {
  if (esMovil()) {
    cerrarPanelMobile();
  }
}

// =============================
// DIBUJO DE CAPAS
// =============================
function dibujarAgresiones(coleccion) {
  if (capaAgresiones) {
    map.removeLayer(capaAgresiones);
  }

  totalDentroRadio = 0;
  var radio = obtenerRadioActual();

  capaAgresiones = L.geoJSON(coleccion, {
    pointToLayer: function (feature, latlng) {
      var colorBase = colorPorAgresion(valorTipoExposicion(feature));
      var dentroRadio = true;

      if (modoRadioActivo && puntoAnalisis) {
        dentroRadio = map.distance(puntoAnalisis, latlng) <= radio;
        if (dentroRadio) totalDentroRadio++;
      }

      return L.circleMarker(latlng, {
        radius: dentroRadio ? (esMovil() ? 9 : 8) : (esMovil() ? 6 : 5),
        fillColor: colorBase,
        color: dentroRadio ? "#111111" : "#7f8c8d",
        weight: dentroRadio ? 2.2 : 0.8,
        opacity: dentroRadio ? 1 : 0.45,
        fillOpacity: dentroRadio ? 0.90 : 0.25
      });
    },
    onEachFeature: function (feature, layer) {
      layer.bindPopup(crearPopupAgresion(feature), {
        maxWidth: 320
      });

      layer.on("click", function () {
        if (modoRadioActivo) {
          definirPuntoAnalisis(layer.getLatLng());
        }
      });

      layer.on("popupopen", function () {
        cerrarPanelSiMovil();
      });
    }
  }).addTo(map);

  actualizarContador(coleccion.features.length);
  actualizarControlCapas();
}

function dibujarVeterinarias() {
  if (capaVeterinarias) {
    map.removeLayer(capaVeterinarias);
  }

  if (!veterinariasVisibles || !datosVeterinarias) {
    capaVeterinarias = null;
    actualizarControlCapas();
    return;
  }

  capaVeterinarias = L.geoJSON(datosVeterinarias, {
    pointToLayer: function (feature, latlng) {
      return L.marker(latlng, {
        icon: L.divIcon({
          html: "🐶",
          className: "icono-servicio",
          iconSize: esMovil() ? [32, 32] : [34, 34],
          iconAnchor: esMovil() ? [16, 32] : [17, 34]
        })
      });
    },
    onEachFeature: function (feature, layer) {
      layer.bindPopup(crearPopupServicio(feature, "Veterinaria"));

      layer.on("click", function () {
        if (modoRadioActivo) {
          definirPuntoAnalisis(layer.getLatLng());
        }
      });

      layer.on("popupopen", function () {
        cerrarPanelSiMovil();
      });
    }
  }).addTo(map);

  actualizarControlCapas();
}

function dibujarHospitales() {
  if (capaHospitales) {
    map.removeLayer(capaHospitales);
  }

  if (!hospitalesVisibles || !datosHospitales) {
    capaHospitales = null;
    actualizarControlCapas();
    return;
  }

  capaHospitales = L.geoJSON(datosHospitales, {
    pointToLayer: function (feature, latlng) {
      return L.marker(latlng, {
        icon: L.divIcon({
          html: "🏥",
          className: "icono-servicio",
          iconSize: esMovil() ? [32, 32] : [34, 34],
          iconAnchor: esMovil() ? [16, 32] : [17, 34]
        })
      });
    },
    onEachFeature: function (feature, layer) {
      layer.bindPopup(crearPopupServicio(feature, "Hospital"));

      layer.on("click", function () {
        if (modoRadioActivo) {
          definirPuntoAnalisis(layer.getLatLng());
        }
      });

      layer.on("popupopen", function () {
        cerrarPanelSiMovil();
      });
    }
  }).addTo(map);

  actualizarControlCapas();
}

// =============================
// CONTROL DE CAPAS
// =============================
function actualizarControlCapas() {
  if (controlCapas) {
    map.removeControl(controlCapas);
  }

  var baseLayers = {
    "OpenStreetMap": osm,
    "Satélite Esri": satelite,
    "Topográfico": topo
  };

  var overlays = {};

  if (capaAgresiones) overlays["Agresiones APTR"] = capaAgresiones;
  if (capaHospitales) overlays["Hospitales"] = capaHospitales;
  if (capaVeterinarias) overlays["Veterinarias"] = capaVeterinarias;
  if (circuloAnalisis) overlays["Radio de análisis"] = circuloAnalisis;
  if (marcadorAnalisis) overlays["Centro de análisis"] = marcadorAnalisis;

  controlCapas = L.control.layers(baseLayers, overlays, {
    collapsed: esMovil()
  }).addTo(map);
}

// =============================
// FILTROS
// =============================
function aplicarFiltros() {
  if (!datosAgresiones || !datosAgresiones.features) return;

  var municipio = document.getElementById("filtroMunicipio").value;
  var tipo = document.getElementById("filtroTipo").value;
  var especie = document.getElementById("filtroEspecie").value;
  var texto = document.getElementById("filtroTexto").value.toLowerCase().trim();

  var filtrados = datosAgresiones.features.filter(function (feature) {
    var municipioValor = valorMunicipio(feature);
    var tipoValor = valorTipoExposicion(feature);
    var especieValor = valorEspecie(feature);
    var direccionValor = valorDireccion(feature).toLowerCase();
    var observacionesValor = valorObservaciones(feature).toLowerCase();
    var tipoLocalizacionValor = valorTipoLocalizacion(feature).toLowerCase();

    var cumpleTexto =
      !texto ||
      direccionValor.includes(texto) ||
      observacionesValor.includes(texto) ||
      municipioValor.toLowerCase().includes(texto) ||
      especieValor.toLowerCase().includes(texto) ||
      tipoLocalizacionValor.includes(texto);

    var cumpleMunicipio = !municipio || municipioValor === municipio;
    var cumpleTipo = !tipo || tipoValor === tipo;
    var cumpleEspecie = !especie || especieValor === especie;
    var cumpleGrave =
      !soloGravesActivo ||
      colorPorAgresion(tipoValor) === "#fe1900";

    return (
      cumpleMunicipio &&
      cumpleTipo &&
      cumpleEspecie &&
      cumpleTexto &&
      cumpleGrave
    );
  });

  dibujarAgresiones({
    type: "FeatureCollection",
    features: filtrados
  });

  if (modoRadioActivo && puntoAnalisis) {
    actualizarGeometriaAnalisis();
  } else if (!modoRadioActivo) {
    actualizarEstadoProximidad("Modo radio inactivo");
  }
}

function limpiarFiltros() {
  document.getElementById("filtroMunicipio").value = "";
  document.getElementById("filtroTipo").value = "";
  document.getElementById("filtroEspecie").value = "";
  document.getElementById("filtroTexto").value = "";
  document.getElementById("filtroRadio").value = 500;

  soloGravesActivo = false;
  modoRadioActivo = false;

  actualizarTextoRadio();
  limpiarAnalisisProximidad();
  actualizarTextoBotones();
  actualizarEstadoProximidad("Modo radio inactivo");

  dibujarHospitales();
  dibujarVeterinarias();
  aplicarFiltros();
}

function prepararFiltros() {
  if (!datosAgresiones || !datosAgresiones.features) return;

  var municipios = [];
  var tipos = [];
  var especies = [];

  datosAgresiones.features.forEach(function (feature) {
    var municipio = valorMunicipio(feature);
    var tipo = valorTipoExposicion(feature);
    var especie = valorEspecie(feature);

    if (municipio) municipios.push(municipio);
    if (tipo) tipos.push(tipo);
    if (especie) especies.push(especie);
  });

  poblarSelect("filtroMunicipio", Array.from(new Set(municipios)).sort(), "Todos");
  poblarSelect("filtroTipo", Array.from(new Set(tipos)).sort(), "Todos");
  poblarSelect("filtroEspecie", Array.from(new Set(especies)).sort(), "Todas");
}

// =============================
// CARGA DE DATOS
// =============================
function fetchGeoJSON(rutas) {
  var index = 0;

  function intentarSiguiente() {
    if (index >= rutas.length) {
      return Promise.reject(
        new Error("No fue posible cargar: " + rutas.join(" | "))
      );
    }

    var ruta = rutas[index++];

    return fetch(ruta)
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status + " en " + ruta);
        }
        return res.json();
      })
      .catch(function () {
        return intentarSiguiente();
      });
  }

  return intentarSiguiente();
}

function ajustarVistaInicial() {
  if (capaAgresiones && capaAgresiones.getLayers().length > 0) {
    map.fitBounds(capaAgresiones.getBounds(), {
      padding: [20, 20]
    });
  }
}

function refrescarMapa() {
  setTimeout(function () {
    map.invalidateSize();
  }, 250);
}

function cargarTodo() {
  Promise.all([
    fetchGeoJSON([
      "datos/Agresiones_APTR_2025-2026.geojson",
      "Agresiones_APTR_2025-2026.geojson"
    ]),
    fetchGeoJSON([
      "datos/Veterinarias_Quindio.geojson",
      "Veterinarias_Quindio.geojson"
    ]),
    fetchGeoJSON([
      "datos/Hospitales_Quindio.geojson",
      "Hospitales_Quindio.geojson"
    ])
  ])
    .then(function (resultados) {
      datosAgresiones = resultados[0];
      datosVeterinarias = resultados[1];
      datosHospitales = resultados[2];

      prepararFiltros();
      dibujarAgresiones(datosAgresiones);
      dibujarVeterinarias();
      dibujarHospitales();
      actualizarTextoRadio();
      actualizarTextoBotones();
      actualizarControlCapas();
      ajustarVistaInicial();
      refrescarMapa();
    })
    .catch(function (error) {
      console.error("Error cargando capas:", error);
      alert("No fue posible cargar una o más capas GeoJSON. Revisa rutas y nombres de archivos.");
    });
}

// =============================
// EVENTOS
// =============================
document.addEventListener("DOMContentLoaded", function () {
  cargarTodo();

  document.getElementById("filtroMunicipio").addEventListener("change", function () {
  aplicarFiltros();

  setTimeout(function () {
    hacerZoomACapaAgresiones();
  }, 100);

  cerrarPanelSiMovil();
});

  document.getElementById("filtroTipo").addEventListener("change", function () {
    aplicarFiltros();
    cerrarPanelSiMovil();
  });

  document.getElementById("filtroEspecie").addEventListener("change", function () {
    aplicarFiltros();
    cerrarPanelSiMovil();
  });

  document.getElementById("filtroTexto").addEventListener("input", aplicarFiltros);

  document.getElementById("filtroRadio").addEventListener("input", function () {
    actualizarTextoRadio();

    if (modoRadioActivo && puntoAnalisis) {
      actualizarGeometriaAnalisis();
      aplicarFiltros();
    }
  });

  document.getElementById("btnSoloGraves").addEventListener("click", function () {
    soloGravesActivo = !soloGravesActivo;
    actualizarTextoBotones();
    aplicarFiltros();
    cerrarPanelSiMovil();
  });

  document.getElementById("btnToggleHospitales").addEventListener("click", function () {
    hospitalesVisibles = !hospitalesVisibles;
    actualizarTextoBotones();
    dibujarHospitales();
    cerrarPanelSiMovil();
  });

  document.getElementById("btnToggleVeterinarias").addEventListener("click", function () {
    veterinariasVisibles = !veterinariasVisibles;
    actualizarTextoBotones();
    dibujarVeterinarias();
    cerrarPanelSiMovil();
  });

  document.getElementById("btnModoRadio").addEventListener("click", function () {
    modoRadioActivo = !modoRadioActivo;
    actualizarTextoBotones();

    if (modoRadioActivo) {
      actualizarEstadoProximidad(
        "Modo radio activo: haga clic en el mapa o en un elemento para definir el centro."
      );
      cerrarPanelSiMovil();
    } else {
      limpiarAnalisisProximidad();
      actualizarEstadoProximidad("Modo radio inactivo");
      aplicarFiltros();
    }
  });

  document.getElementById("btnLimpiar").addEventListener("click", function () {
    limpiarFiltros();
    cerrarPanelSiMovil();
  });

  document.getElementById("btnTogglePanelMobile").addEventListener("click", alternarPanelMobile);
  document.getElementById("btnCerrarPanelMobile").addEventListener("click", cerrarPanelMobile);

  map.on("click", function (e) {
    if (modoRadioActivo) {
      definirPuntoAnalisis(e.latlng);
      cerrarPanelSiMovil();
    }
  });

  window.addEventListener("resize", function () {
    actualizarControlCapas();
    refrescarMapa();

    if (!esMovil()) {
      document.getElementById("panel-filtros").classList.remove("abierto");
      panelMobileAbierto = false;
    }
  });
});
