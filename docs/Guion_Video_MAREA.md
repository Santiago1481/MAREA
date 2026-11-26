# Guion del video · MAREA — Navegando mareas

**Presenta:** Santiago Chaparro Riaño · 8.º semestre · Arquitectura de Software, Unidad 3
**Duración estimada:** 13 min 40 s (máximo 15 min) · ≈ 1.763 palabras a un ritmo pausado
**Material:** `Presentacion_MAREA.pdf` (16 diapositivas) + demo en vivo (`npm start` → http://localhost:5173)

> **Antes de grabar:** abre la demo en el navegador, deja la presentación a pantalla completa y ten una terminal con `npm test` lista. Graba en 1080p (OBS: pantalla + cámara pequeña en una esquina). Lo que aparece entre **[corchetes]** es una acción, no se lee en voz alta.

---

## 0:00 – 0:45 · 01 · Portada

*En pantalla: Cámara visible. Portada en pantalla completa.*

Hola, mi nombre es Santiago Chaparro Riaño, estudiante de octavo semestre de Ingeniería de Software en la Tecnológica del Oriente.

En este video presento la actividad de la Unidad 3 del curso Arquitectura de Software: "Navegando mareas: estrategias de navegación en la arquitectura de software".

Mi propuesta se llama MAREA, que significa Motor Adaptativo de Rutas con Estrategias Intercambiables. Voy a mostrar cómo diagnostiqué la arquitectura de un servicio de rutas y cómo la rediseñé con patrones de diseño, hasta hacerla unas 100 veces más rápida sin perder ni una sola ruta óptima.

---

## 0:45 – 2:00 · 02 · El problema de navegación

*En pantalla: Señalar la pregunta central y luego las tres tarjetas de la derecha.*

Empecemos por el problema. Imaginemos una aplicación de movilidad urbana que debe calcular, para cada conductor, la ruta más rápida entre un origen y un destino.

La ciudad del caso de estudio tiene una particularidad: está atravesada por un río que solo se puede cruzar por puentes. Eso concentra el tráfico en pocos tramos y obliga a los algoritmos ingenuos a explorar casi todo el mapa. Además, las vías tienen velocidades distintas: avenidas a 60, calles a 30 y puentes a 40 kilómetros por hora.

Hay dos condiciones más que hacen el problema realista. Primero, la demanda está concentrada: en hora pico unas pocas rutas reciben la mayoría de las consultas. Segundo, la red cambia en vivo: accidentes y obras alteran los tiempos de recorrido.

Entonces la pregunta que guía todo el proyecto es: ¿cómo calcular la ruta más rápida en menos de un milisegundo, que escale cuando la ciudad crece y que reaccione al tráfico sin entregar nunca una ruta obsoleta?

Este problema impacta tres frentes: la experiencia del usuario, porque una ruta lenta o desactualizada genera desconfianza; el rendimiento, porque el sistema actual explora 36.325 nodos en cada consulta; y la operación, porque escalar un algoritmo cuadrático en hora pico es muy costoso.

---

## 2:00 – 3:10 · 03 · Diagnóstico AS-IS

*En pantalla: Señalar el lado rojo de la figura y luego la tabla H1–H5.*

Antes de proponer, evalué la arquitectura actual, lo que llamamos el AS-IS. Es un controlador monolítico que, en cada solicitud, ejecuta Dijkstra con una cola de prioridad implementada como un arreglo sin ordenar y sin parada temprana. Es decir, calcula los caminos a toda la ciudad aunque solo necesite un destino.

Encontré cinco hallazgos. Uno: el algoritmo es de orden cuadrático. Dos: está acoplado al controlador, así que cambiarlo exige modificar el monolito. Tres: no hay caché, y la misma ruta caliente se recalcula miles de veces. Cuatro: el tráfico no se propaga como eventos, la única forma de reflejar un accidente es recargar todo. Y cinco: no hay bitácora ni forma de deshacer acciones.

Medido, el AS-IS tarda en promedio 5,24 milisegundos por ruta, con un percentil 95 de 7,1 milisegundos, y atiende unas 191 rutas por segundo.

Para que la evaluación fuera objetiva usé una versión ligera del método ATAM: definí escenarios de calidad con una medida verificable, de eficiencia, escalabilidad, corrección con tráfico y modificabilidad, que retomo al final.

---

## 3:10 – 4:00 · 04 · Investigación

*En pantalla: Recorrer la tabla fila por fila.*

Luego revisé la literatura de planificación de rutas. Dijkstra con montículo es la referencia de optimalidad. La versión bidireccional lanza dos búsquedas que se encuentran en el medio. A* usa una heurística geométrica para dirigir la búsqueda hacia el destino. Y ALT, que significa A estrella con landmarks y desigualdad triangular, precalcula distancias desde unos puntos de referencia para obtener una cota mucho más ajustada.

También analicé Contraction Hierarchies, la técnica de motores reales como OSRM. La dejé como trabajo futuro porque su preprocesamiento es pesado y no se adapta bien al tráfico dinámico.

De este análisis salieron los criterios de diseño que ven abajo: percentil 95 menor a un milisegundo, crecimiento sublineal, cero rutas obsoletas, que un algoritmo nuevo sea una sola clase y que los nodos no guarden estado para escalar horizontalmente.

---

## 4:00 – 5:20 · 05 · Componentes → 06 · Clases

*En pantalla: En la 05 seguir con el cursor la columna izquierda de arriba abajo. Pasar a la 06.*

Con esto diseñé la arquitectura. En el diagrama de componentes, la columna izquierda es la ruta crítica de una solicitud. Entra por NavigationSystem, que es la fachada; pasa al CommandBus, que registra la acción; llega al CachedRouter, el proxy de caché; y si no hay acierto, el Router delega en la estrategia de navegación, que consulta el modelo de la ciudad.

A la derecha están los servicios que observan: el servicio de tráfico publica incidentes, la sesión de navegación se re-rutea y un colector de métricas mide cada cálculo. Los landmarks se calculan fuera de línea.

En el diagrama de clases se ve el corazón del diseño. RoutingStrategy es la abstracción y debajo están las seis estrategias: la Legacy, que es el AS-IS; Dijkstra; la bidireccional; A*; ALT, que hereda de A* y solo cambia la heurística; y la Adaptativa, que compone dos estrategias.

Arriba, Router y CachedRouter implementan la misma interfaz IRouter. Por eso el cliente no distingue si la respuesta vino de la caché o de un cálculo nuevo. Eso es exactamente el patrón Proxy.

---

## 5:20 – 6:20 · 08 · Secuencia → 09 · Actividad

*En pantalla: En la 08 señalar el fragmento alt y luego el opt en la parte baja. Pasar a la 09.*

El diagrama de secuencia muestra la estrategia de navegación en dos fases. En la primera, la solicitud llega al proxy. Si es un acierto, responde en microsegundos. Si no, la estrategia adaptativa elige ALT, calcula la ruta y el proxy la guarda indexada por sus tramos.

En la segunda fase entra un incidente. El servicio de tráfico notifica a la caché, que invalida solo las rutas afectadas, y notifica a la sesión del conductor, que se re-rutea automáticamente.

El diagrama de actividad resume la política adaptativa: si el viaje es corto, menos de treinta cuadras en línea recta, uso A*, que no necesita memoria adicional; si es largo, uso ALT, que poda mucho más. Y a la derecha está el lazo de re-ruteo que dispara el servicio de tráfico.

---

## 6:20 – 7:30 · 07 · Patrones → 10 · Innovación

*En pantalla: En la 07 recorrer las tarjetas. En la 10 señalar la fórmula y después las barras.*

Cada patrón resuelve un hallazgo concreto. Strategy y Factory resuelven el algoritmo fijo y acoplado. Proxy resuelve la falta de caché. Observer resuelve la propagación del tráfico. Command aporta la bitácora y el deshacer. Iterator genera las instrucciones giro a giro de forma perezosa. Y Facade ofrece una sola puerta de entrada.

Ahora, el aporte diferencial. Cuando un tramo se encarece, es fácil: solo invalido las rutas que pasan por ese tramo. El problema es cuando el incidente termina y el tramo se abarata: en teoría cualquier ruta podría mejorar, y lo ingenuo es vaciar toda la caché.

Mi solución es reutilizar las cotas inferiores de ALT. Una ruta guardada con costo C solo puede mejorar si existe un camino por el tramo abaratado cuyo costo mínimo posible sea menor que C. Si la cota demuestra que no, la ruta sigue siendo óptima y la conservo.

El resultado: con 30 incidentes, la tasa de aciertos pasa de 43 % con vaciado total a 80 % con cotas ALT, y en las tres políticas verifiqué cero rutas obsoletas en 1.000 comprobaciones contra Dijkstra.

---

## 7:30 – 10:30 · 11 · Prototipo → DEMO EN VIVO

*En pantalla: Cambiar al navegador con la demo abierta (npm start → localhost:5173). Seguir los pasos indicados entre corchetes.*

Ahora vamos al prototipo funcionando. Está escrito en JavaScript sin dependencias externas, y el mismo núcleo corre en Node para las pruebas y en el navegador para esta demo.

**[Clic en «Ruta aleatoria».]** Aquí calculo una ruta. La zona sombreada son los nodos que exploró el algoritmo, y a la derecha veo la latencia, los nodos expandidos, el tiempo de viaje y la distancia.

**[Clic en «Legacy (AS-IS)».]** Si cambio a la estrategia Legacy, miren cómo la sombra cubre prácticamente toda la ciudad: eso es el sistema actual. **[Clic en «Adaptativa».]** Y si vuelvo a la adaptativa, la exploración se concentra en el corredor del viaje.

**[Clic en «Comparar estrategias».]** Con el botón comparar ejecuto las cuatro estrategias sobre el mismo viaje. Fíjense en la columna de tiempo de viaje: todas dan exactamente el mismo, porque todas son óptimas. Lo que cambia es el trabajo: de miles de nodos con Dijkstra a cientos con ALT.

**[Clic en un punto a un lado del río y luego en otro al otro lado.]** También puedo elegir origen y destino en el mapa. Como están en orillas opuestas, el algoritmo encuentra el puente que conviene.

**[Volver a pedir la misma ruta.]** Si pido la misma ruta otra vez, el panel indica «respuesta desde caché» con cero nodos expandidos: ese es el Proxy trabajando.

**[Clic en «Inyectar incidente en la ruta».]** Ahora simulo un accidente. El tramo rojo queda congestionado, la bitácora registra el evento y, sin que yo haga nada, la sesión se re-rutea sola: la ruta anterior queda punteada y la nueva la esquiva. Eso es el patrón Observer.

**[Clic en «Deshacer último comando».]** Y como cada acción es un comando, puedo deshacer el incidente y el tráfico vuelve a su estado anterior.

**[Señalar el panel «Indicaciones».]** Por último, aquí están las instrucciones giro a giro, como «gire a la derecha en la Avenida Carrera 8», generadas por el iterador.

---

## 10:30 – 11:50 · 12 · Escalabilidad → 13 · Caché y extremo a extremo

*En pantalla: Opcional: mostrar 10 s la terminal con «npm test» en verde. Volver a las diapositivas.*

Para validar todo esto escribí doce pruebas automáticas, que pasan, entre ellas una que verifica que todas las estrategias devuelven exactamente el mismo costo que Dijkstra, incluso con congestión. Y un banco de pruebas reproducible con semillas fijas.

En escalabilidad, en la ciudad más grande, de 36.325 intersecciones, ALT es 19 veces más rápido que el AS-IS y explora un 96 % menos de nodos. Lo más importante: cuando la red crece 11 veces, el AS-IS se vuelve 31 veces más lento, mientras que ALT solo 8,2 veces. Es decir, crece de forma sublineal.

En caché, con demanda concentrada, una LRU de cuatrocientas rutas alcanza un 88 % de aciertos y multiplica el throughput de 3.809 a 28.147 rutas por segundo.

Y de extremo a extremo, con mil solicitudes, la latencia media baja de 5,24 a 0,052 milisegundos, unas 100 veces menos, y el percentil 95 mejora 25 veces. Todo eso sin perder optimalidad: la brecha medida fue cero.

---

## 11:50 – 12:50 · 14 · Escalabilidad y propuesta ágil

*En pantalla: Señalar el diagrama de despliegue y luego la tabla de sprints.*

Para producción propongo este despliegue: los pods de ruteo no guardan estado y escalan horizontalmente; la caché y su índice se comparten en Redis; los incidentes llegan por un flujo de eventos, que es el Observer llevado a un sistema distribuido; y los landmarks se recalculan en un proceso nocturno.

La migración la planteo con Scrum en cuatro sprints, cada uno con un indicador verificable. En el primero, desacoplar con Strategy y agregar A*, que ya da unas 13 veces de mejora. En el segundo, la caché y el bus de comandos. En el tercero, el tráfico vivo, ALT y las cotas. Y en el cuarto, el escalado horizontal. Uso el patrón strangler fig: la nueva interfaz envuelve al código heredado y lo reemplaza pieza por pieza, siempre con la opción de volver atrás con un deshacer.

---

## 12:50 – 13:40 · 15 · Conclusiones → 16 · Cierre

*En pantalla: Leer las cuatro tarjetas. Terminar en la diapositiva 16 con la cámara visible.*

Para cerrar, cuatro conclusiones. Primera: el cuello de botella era arquitectónico, no solo algorítmico; desacoplar con Strategy me permitió medir, comparar y adaptar.

Segunda: los patrones se refuerzan entre sí; Proxy más Observer producen una caché consciente del tráfico.

Tercera: la mejora está verificada con datos: 100 veces menos latencia media y un 96 % menos de trabajo, con optimalidad intacta.

Y cuarta: reutilizar las cotas de ALT para invalidar la caché eleva los aciertos bajo tráfico del 43 % al 80 % sin servir nunca una ruta obsoleta.

El código, las pruebas y la documentación están en el repositorio que adjunto en la plataforma. Muchas gracias por su atención.

---

## Plan B para la demo

Si algo falla en vivo, abre `http://localhost:5173/web/?demo=incident` o `?demo=compare`: son escenarios fijos que siempre se ven igual.

## Checklist de entrega

- [x] Grabar (≤ 15 min) y subir a YouTube como **No listado**.
- [x] Video: https://youtu.be/uT6hFnQfG98
- [x] Repositorio: https://github.com/Santiago1481/MAREA
- [ ] Cargar en el LMS: `Informe_MAREA.pdf`, `Presentacion_MAREA.pdf` y el enlace del video.
