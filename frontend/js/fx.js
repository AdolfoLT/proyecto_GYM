/* Animaciones reutilizables. Cada una respeta prefers-reduced-motion. */
export const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const sinMovimiento = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const conPuntero = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Resorte estilo Apple { duration, bounce } convertido a easing `linear()` para WAAPI. */
export function muelle(duracion = 0.5, rebote = 0.2, n = 48) {
  const z = 1 - rebote, w = (2 * Math.PI) / duracion, wd = w * Math.sqrt(1 - z * z);
  const puntos = Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * duracion * 1.6;
    return (1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t))).toFixed(4);
  });
  return { easing: `linear(${puntos.join(',')})`, duration: duracion * 1600 };
}

/** Divide un texto en palabras y letras (.wd > .ch) para la animación de entrada. */
export function partir(el) {
  const texto = el.textContent;
  el.setAttribute('aria-label', texto);
  el.textContent = '';
  let c = 0;
  texto.split(' ').forEach((palabra, i, todas) => {
    const wd = Object.assign(document.createElement('span'), { className: 'wd' });
    wd.setAttribute('aria-hidden', 'true');
    for (const letra of palabra) {
      const ch = Object.assign(document.createElement('span'), { className: 'ch', textContent: letra });
      ch.style.setProperty('--c', c++);
      wd.append(ch);
    }
    el.append(wd, i < todas.length - 1 ? ' ' : '');
  });
}

export function alEntrar(nodos, fn, umbral = 0.12) {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { fn(e.target); io.unobserve(e.target); }
  }), { threshold: umbral });
  nodos.forEach((n) => io.observe(n));
}

/** Aparición al hacer scroll. Al terminar se quita data-r para que los :hover recuperen sus propias transiciones. */
export function revelar(contexto = document) {
  alEntrar(contexto.querySelectorAll('[data-r]:not(.in), .sp:not(.in)'), (el) => {
    el.classList.add('in');
    if (el.hasAttribute('data-r')) setTimeout(() => el.removeAttribute('data-r'), 1600);
  });
}

/** Cuenta de `desde` a `hasta` con ease-out; se puede interrumpir llamándola de nuevo sobre el mismo elemento. */
export function contar(el, hasta, { desde = 0, ms = 900, formato = (n) => Math.round(n).toLocaleString('es-MX') } = {}) {
  cancelAnimationFrame(el._raf);
  if (sinMovimiento()) return void (el.textContent = formato(hasta));
  const t0 = performance.now();
  const paso = (t) => {
    const p = Math.min((t - t0) / ms, 1);
    el.textContent = formato(desde + (hasta - desde) * (1 - (1 - p) ** 4));
    if (p < 1) el._raf = requestAnimationFrame(paso);
  };
  el._raf = requestAnimationFrame(paso);
}

/** Píldora que se desliza detrás del botón activo (solo transform). */
export function pildora(contenedor, boton, animar = true) {
  const p = contenedor.querySelector('.pill');
  if (!animar) p.style.transition = 'none';
  p.style.transform = `translate(${boton.offsetLeft}px, ${boton.offsetTop}px) scale(${boton.offsetWidth / 100}, ${boton.offsetHeight / 100})`;
  if (!animar) { p.offsetWidth; p.style.transition = ''; }
}

export function entrarLista(nodos) {
  if (sinMovimiento()) return;
  [...nodos].forEach((n, i) => n.animate(
    [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
    { duration: 240, delay: i * 35, easing: EASE, fill: 'backwards' }
  ));
}

export function sacudir(el) {
  if (sinMovimiento()) return;
  el.animate(
    [{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }],
    { duration: 280, easing: EASE }
  );
}

/** Foco de luz que sigue al cursor sobre las tarjetas (decorativo, solo con puntero fino). */
export function foco(tarjetas) {
  if (!conPuntero()) return;
  tarjetas.forEach((t) => t.addEventListener('pointermove', (e) => {
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${e.clientX - r.left}px`);
    t.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));
}
