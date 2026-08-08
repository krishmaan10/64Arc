/* ==========================================================================
   64ARC — site.js
   Zero-dependency behaviour layer.

     · Header surface change on scroll
     · Mobile navigation drawer
     · Scroll-reveal (lines draw, nodes connect, components align)
     · SVG path auto-measurement for stroke-draw animations
     · AI query demonstrations (signals travelling through the architecture)
     · Contact form submission
   ========================================================================== */

(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     CONFIG
     ----------------------------------------------------------------------
     FORM_ENDPOINT — paste a form endpoint here (Formspree, Basin, Getform,
     Netlify Forms, or your own handler) to receive enquiries by POST.
     Leave empty and the contact form falls back to opening the visitor's
     email client with the message pre-composed.
     -------------------------------------------------------------------- */
  var FORM_ENDPOINT = '';
  var CONTACT_EMAIL = 'hello@64arc.com';

  // Gate JS-only controls in CSS. Set before first paint rather than in boot(),
  // so an enhanced control never flashes in after the page has rendered.
  document.documentElement.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ======================================================================
     1 · HEADER
     ====================================================================== */

  function initHeader() {
    var header = $('.header');
    if (!header) return;

    var threshold = 24;
    var ticking = false;

    function update() {
      header.classList.toggle('is-stuck', window.scrollY > threshold);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ======================================================================
     2 · MOBILE NAVIGATION
     ====================================================================== */

  function initMobileNav() {
    var burger = $('.burger');
    var drawer = $('.mobile-nav');
    if (!burger || !drawer) return;

    function focusables() {
      return $$('a[href], button:not([disabled])', drawer)
        .filter(function (el) { return el.offsetParent !== null; });
    }

    function setOpen(open) {
      burger.setAttribute('aria-expanded', String(open));
      drawer.classList.toggle('is-open', open);
      document.body.classList.toggle('is-locked', open);
      drawer.setAttribute('aria-hidden', String(!open));
      // The drawer covers the viewport opaquely, so focus must not walk behind it.
      drawer.setAttribute('inert', '');
      if (open) {
        drawer.removeAttribute('inert');
        // Wait for the drawer to actually become visible — an element that is
        // still visibility:hidden cannot take focus.
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            var first = focusables()[0];
            if (first) first.focus();
          });
        });
      }
    }

    burger.addEventListener('click', function () {
      setOpen(burger.getAttribute('aria-expanded') !== 'true');
    });

    // Keep Tab inside the open drawer.
    drawer.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var items = focusables();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    $$('a', drawer).forEach(function (a) {
      a.addEventListener('click', function () { setOpen(false); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        burger.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 1040) setOpen(false);
    });

    setOpen(false);
  }

  /* ======================================================================
     3 · SVG STROKE MEASUREMENT
     Every element carrying .draw gets its own path length written into a
     custom property, so the line draws at its true length rather than an
     arbitrary dash guess.
     ====================================================================== */

  function measureStrokes(root) {
    $$('.draw, .flow', root || document).forEach(function (el) {
      if (el.dataset.measured) return;
      var len;
      try { len = el.getTotalLength(); } catch (err) { len = 0; }
      if (!len || !isFinite(len)) {
        // Fall back for shapes without getTotalLength support
        var box = el.getBBox ? el.getBBox() : null;
        len = box ? (box.width + box.height) * 2 : 1000;
      }
      el.style.setProperty('--len', Math.ceil(len));
      el.dataset.measured = '1';
    });
  }

  /* ======================================================================
     4 · SCROLL REVEAL
     One observer drives every entrance: text rising, rules drawing, nodes
     connecting, fragments snapping into alignment.
     ====================================================================== */

  function initReveal() {
    var targets = $$('.reveal, .reveal-l, .reveal-r, .rule-draw, .observe, .mega');

    // Auto-stagger children of any [data-stagger] container
    $$('[data-stagger]').forEach(function (group) {
      var step = parseFloat(group.dataset.stagger) || 0.08;
      var kids = $$(':scope > *', group);
      kids.forEach(function (kid, i) {
        if (!kid.style.getPropertyValue('--delay')) {
          kid.style.setProperty('--delay', (i * step).toFixed(2) + 's');
        }
      });
    });

    if (!('IntersectionObserver' in window) || reduceMotion) {
      targets.forEach(function (el) { el.classList.add('in-view'); });
      measureStrokes();
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        measureStrokes(entry.target);
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ======================================================================
     5 · HERO ENTRANCE
     ====================================================================== */

  function initHero() {
    var hero = $('[data-hero]');
    if (!hero) return;
    measureStrokes(hero);
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        hero.classList.add('is-ready', 'in-view');
      });
    });
  }

  /* ======================================================================
     6 · AI QUERY DEMONSTRATIONS
     A question enters the architecture, travels stop by stop through the
     business layers, and returns an answer.
     ====================================================================== */

  function initAiDemos() {
    var demos = $$('.ai-demo');
    if (!demos.length) return;

    function run(demo) {
      if (demo.dataset.running === '1') return;
      demo.dataset.running = '1';

      var stops  = $$('.ai-stop', demo);
      var wires  = $$('.ai-wire', demo);
      var result = $('.ai-result', demo);
      var stepMs = reduceMotion ? 0 : 460;

      stops.forEach(function (s) { s.classList.remove('is-lit'); });
      wires.forEach(function (w) { w.classList.remove('is-lit'); });
      if (result) result.classList.remove('is-shown');

      var timers = [];
      stops.forEach(function (stop, i) {
        timers.push(setTimeout(function () {
          stop.classList.add('is-lit');
          if (wires[i]) wires[i].classList.add('is-lit');
        }, i * stepMs));
      });

      timers.push(setTimeout(function () {
        if (result) result.classList.add('is-shown');
        demo.dataset.running = '0';
      }, stops.length * stepMs + 260));

      demo._timers = timers;
    }

    demos.forEach(function (demo) {
      var replay = $('.ai-replay', demo);
      if (replay) {
        replay.addEventListener('click', function () {
          (demo._timers || []).forEach(clearTimeout);
          demo.dataset.running = '0';
          run(demo);
        });
      }
    });

    if (!('IntersectionObserver' in window)) {
      demos.forEach(run);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        setTimeout(function () { run(entry.target); }, 320);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.4 });

    demos.forEach(function (d) { io.observe(d); });
  }

  /* ======================================================================
     7 · CONTACT FORM
     ====================================================================== */

  function initForm() {
    var form = $('[data-contact-form]');
    if (!form) return;

    var status = $('.form-status', form);
    var submit = $('[type="submit"]', form);

    function say(message, isError) {
      if (!status) return;
      status.textContent = message;
      status.classList.add('is-shown');
      status.classList.toggle('is-error', !!isError);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;

      var data = new FormData(form);

      if (!FORM_ENDPOINT) {
        // No endpoint configured — hand the message to the visitor's mail client.
        var lines = [];
        data.forEach(function (value, key) {
          if (String(value).trim()) lines.push(key + ': ' + value);
        });
        var subject = 'Architecture conversation — ' + (data.get('company') || data.get('name') || 'new enquiry');
        window.location.href = 'mailto:' + CONTACT_EMAIL +
          '?subject=' + encodeURIComponent(subject) +
          '&body=' + encodeURIComponent(lines.join('\n'));
        say('Opening your email client. If nothing happens, write to ' + CONTACT_EMAIL + ' directly.');
        return;
      }

      var original = submit ? submit.textContent : '';
      if (submit) { submit.disabled = true; submit.textContent = 'Sending…'; }

      fetch(FORM_ENDPOINT, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' }
      }).then(function (res) {
        if (!res.ok) throw new Error('Request failed');
        form.reset();
        say('Thank you. We have your note and will come back to you within two working days.');
      }).catch(function () {
        say('Something went wrong sending that. Please email ' + CONTACT_EMAIL + ' and we will pick it up from there.', true);
      }).finally(function () {
        if (submit) { submit.disabled = false; submit.textContent = original; }
      });
    });
  }

  /* ======================================================================
     8 · PICKERS
     A generic narrowing control. A picker declares which attribute names its
     items — data-picker="model" drives [data-model], data-picker="cap" drives
     [data-cap] — so one function serves every page that wants one.

     Progressive enhancement: the control is hidden until the .js gate opens,
     and items are only ever hidden at runtime, so with scripting off the whole
     page is present and nothing is unreachable.
     ====================================================================== */

  function initPickers() {
    $$('[data-picker]').forEach(function (picker) {
      var key = picker.dataset.picker;
      if (!key) return;

      var buttons = $$('.picker-btn', picker);
      var items   = $$('[data-' + key + ']');
      var status  = $('[data-picker-status]', picker);
      if (!buttons.length || !items.length) return;

      var allLabel = picker.dataset.pickerAll || 'Showing everything';
      var note     = picker.dataset.pickerNote || '';

      function apply(choice, label) {
        var visible = [];

        items.forEach(function (el) {
          if (choice === 'all' || el.dataset[key] === choice) {
            el.removeAttribute('hidden');
            visible.push(el);
          } else {
            el.setAttribute('hidden', '');
          }
        });

        // Narrowing to one can strand a section between two neighbours that
        // share its surface colour. Flag the solo case so CSS can restore the
        // light/dark rhythm.
        items.forEach(function (el) { el.classList.remove('is-solo'); });
        if (visible.length === 1) visible[0].classList.add('is-solo');

        var shown = visible.length;

        buttons.forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.dataset.pick === choice));
        });

        if (status) {
          status.textContent = choice === 'all'
            ? allLabel
            : ('Showing ' + label + '.' + (note ? ' ' + note : ''));
        }
        return shown;
      }

      buttons.forEach(function (b) {
        b.addEventListener('click', function () {
          apply(b.dataset.pick, (b.textContent || '').trim());
        });
      });

      apply('all', '');
    });
  }

  /* ======================================================================
     9 · SMALL UTILITIES
     ====================================================================== */

  function initYear() {
    $$('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  function initMailLinks() {
    $$('[data-mail]').forEach(function (el) {
      el.setAttribute('href', 'mailto:' + CONTACT_EMAIL);
      if (el.dataset.mail === 'text') el.textContent = CONTACT_EMAIL;
    });
  }

  /* ======================================================================
     BOOT
     ====================================================================== */

  function boot() {
    initHeader();
    initMobileNav();
    initReveal();
    initHero();
    initAiDemos();
    initForm();
    initPickers();
    initYear();
    initMailLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
