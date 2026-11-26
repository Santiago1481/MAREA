# MAREA · Motor Adaptativo de Rutas con Estrategias Intercambiables

Prototipo de la actividad **"Navegando mareas: Estrategias de navegación en la arquitectura de software"** (Arquitectura de Software, Unidad 3).

MAREA calcula la ruta de menor tiempo de viaje en una ciudad sintética atravesada por un río que solo se cruza por puentes. Reacciona a incidentes de tráfico sin servir nunca una ruta obsoleta.

**Video de presentación:** https://youtu.be/uT6hFnQfG98  
**Repositorio:** https://github.com/Santiago1481/MAREA

## Requisitos

Node.js ≥ 18. No tiene dependencias externas.

```bash
npm test        # 12 pruebas (optimalidad, caché, Observer, Command, Iterator…)
npm run bench   # banco de pruebas reproducible → results/results.json
npm start       # demo interactiva → http://localhost:5173
```

La demo también acepta `?demo=compare` y `?demo=incident`, dos escenarios deterministas para capturas y video.

## Arquitectura

```
Web Client ─► NavigationSystem «Facade»
                 ├─► CommandBus «Command» ─► CachedRouter «Proxy» ─► Router «Strategy ctx» ─► RoutingStrategy
                 │                                 ▲                                          ├ LegacyDijkstra (AS-IS)
                 │                                 │ onTrafficEvent                           ├ Dijkstra · Bidireccional
                 ├─► RouteIterator «Iterator»      │                                          ├ AStar ─► ALT (landmarks)
                 └─► TrafficService «Subject» ─────┴─► NavigationSession «Observer»           └ Adaptive (A* | ALT)
```

| Carpeta | Contenido |
|---|---|
| `src/core` | Grafo, generador de ciudad, montículo binario, PRNG y Zipf |
| `src/strategies` | Las 6 estrategias y la `StrategyFactory` |
| `src/patterns` | Router, CachedRouter (Proxy), TrafficService (Observer), Command, Iterator y Facade |
| `web/` | Demo en Canvas |
| `test/`, `bench/` | Pruebas `node:test` y benchmark |

## Patrones

- **Strategy:** algoritmos intercambiables en ejecución.
- **Factory:** registro de estrategias; ALT comparte su preprocesamiento.
- **Proxy:** caché LRU con índice arista→rutas.
- **Observer:** los incidentes invalidan la caché y re-rutean la sesión activa.
- **Command:** bitácora y deshacer.
- **Iterator:** instrucciones giro a giro.
- **Facade:** punto de entrada único.

**Aporte:** al terminar un incidente, la caché conserva toda ruta s→t de costo C mientras `min(LB(s,u)+w+LB(v,t), LB(s,v)+w+LB(u,t)) ≥ C`, donde LB es la cota ALT. Así eleva los aciertos bajo tráfico dinámico de ~43 % a ~80 %, con 0 rutas obsoletas.

## Resultados (ciudad 200×200, 36 325 nodos)

| Estrategia | ms/consulta | Nodos expandidos |
|---|---:|---:|
| Legacy (AS-IS) | 13,7 | 36 325 |
| Dijkstra + heap | 4,0 | 20 847 |
| A* | 1,0 | 3 214 |
| ALT | 0,7 | 1 442 |

En la prueba extremo a extremo (1 000 solicitudes Zipf en 140×140), la latencia media es unas 100 veces menor que en el AS-IS. Las cifras exactas están en `results/results.json` y varían ligeramente según la máquina.

## Documentación

- `docs/Informe_MAREA.pdf` — informe técnico (15 páginas)
- `docs/Presentacion_MAREA.pdf` — presentación de apoyo
- `docs/Guion_Video_MAREA.pdf` — guion del video
- `docs/diagrams/` — diagramas UML en SVG (componentes, clases, secuencia, actividad, despliegue)
- `docs/charts/`, `docs/img/` — gráficas de resultados y capturas del prototipo

Autor: Santiago Chaparro Riaño · Arquitectura de Software · 8.º semestre
