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

function colorPorAgresion(valor) {
  valor = normalizarValor(valor);

  if (!valor) return "#66bd63";
  if (valor === "Exposición grave") return "#fe1900";
  if (valor === "Exposición leve") return "#fdae61";
  if (valor === "No exposición") return "#66bd63";

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
  if (contador) {
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
    return L.latLng(coords[1], coords[0]);
  }

  return null;
}

function crearPopupAgresion(feature) {
  var p = feature.properties || {};

  return (
    "<b>" + normalizarValor(p.TIPO_DE_EXPOSICION) + "</b><br>" +
    "Municipio: " + normalizarValor(p.Municipio) + "<br>" +
    "Fecha de agresión: " + normalizarValor(p.Fecha_de_agresin) + "<br>" +
    "Fecha de visita: " + normalizarValor(p.Fecha_de_visita) + "<br>" +
    "Dirección: " + normalizarValor(p.Direccin) + "<br>" +
    "Especie: " + normalizarValor(p.Especie)
  );
}

function limpiarAnalisisProximidad() {
  puntoAnalisis = null;

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

  capaAgresiones = L.geoJSON(coleccion, {
    pointToLayer: function (feature, latlng) {
      return L.circleMarker(latlng, {
        radius: esMovil() ? 8 : 7,
        fillColor: colorPorAgresion(feature.properties.TIPO_DE_EXPOSICION),
        color: "#2c3e50",
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.75
      });
    },
    onEachFeature: function (feature, layer) {
      layer.bindPopup(crearPopupAgresion(feature));

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
      var p = feature.properties || {};
      layer.bindPopup("<b>" + normalizarValor(p.name) + "</b>");

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
      var p = feature.properties || {};
      layer.bindPopup(
        "<b>" + normalizarValor(p.name) + "</b><br>" +
        "Especialidad: " + normalizarValor(p.healthcare || p.amenity)
      );

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
  var radio = obtenerRadioActual();

  var filtrados = datosAgresiones.features.filter(function (feature) {
    var p = feature.properties || {};

    var municipioValor = normalizarValor(p.Municipio);
    var tipoValor = normalizarValor(p.TIPO_DE_EXPOSICION);
    var especieValor = normalizarValor(p.Especie);

    var direccionValor = normalizarValor(p.Direccin).toLowerCase();
    var observacionesValor = normalizarValor(p.Observaciones).toLowerCase();
    var municipioTexto = municipioValor.toLowerCase();

    var cumpleTexto =
      !texto ||
      direccionValor.includes(texto) ||
      observacionesValor.includes(texto) ||
      municipioTexto.includes(texto);

    var cumpleMunicipio = !municipio || municipioValor === municipio;
    var cumpleTipo = !tipo || tipoValor === tipo;
    var cumpleEspecie = !especie || especieValor === especie;
    var cumpleGrave = !soloGravesActivo || tipoValor === "Exposición grave";

    var cumpleRadio = true;

    if (modoRadioActivo && puntoAnalisis) {
      var latlngFeature = obtenerLatLngDeFeature(feature);

      if (latlngFeature) {
        var distancia = map.distance(puntoAnalisis, latlngFeature);
        cumpleRadio = distancia <= radio;
      }
    }

    return (
      cumpleMunicipio &&
      cumpleTipo &&
      cumpleEspecie &&
      cumpleTexto &&
      cumpleGrave &&
      cumpleRadio
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
    var p = feature.properties || {};

    var municipio = normalizarValor(p.Municipio);
    var tipo = normalizarValor(p.TIPO_DE_EXPOSICION);
    var especie = normalizarValor(p.Especie);

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
      "datos/Agresiones_APTR_Quindio_2026_2.geojson",
      "Agresiones_APTR_Quindio_2026_2.geojson"
    ]),
    fetchGeoJSON([
      "datos/Veterinarias_Quindio.geojson",
      "Veterinarias_Quindio.geojson"
    ]),
    fetchGeoJSON([
      "datos/Clinicas_Quindio.geojson",
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