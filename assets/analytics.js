/* ===========================================================
   Aravali Outdoors — visitor & event tracking
   Provider-agnostic: forwards to whichever analytics is loaded
   (Vercel Web Analytics by default; GA4 / PostHog / Plausible
   also supported if their snippet is present).
   Pageviews are tracked automatically by the provider script.
   =========================================================== */
(function () {
  // Vercel Web Analytics queue stub (so events fired before the
  // script finishes loading are not lost).
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };

  // Single funnel for every custom event.
  function track(name, data) {
    data = data || {};
    try { if (window.va) window.va("event", Object.assign({ name: name }, data)); } catch (e) {}
    try { if (window.gtag) window.gtag("event", name, data); } catch (e) {}
    try { if (window.posthog) window.posthog.capture(name, data); } catch (e) {}
    try { if (window.plausible) window.plausible(name, { props: data }); } catch (e) {}
  }
  window.track = track;

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function sectionOf(el) {
    var s = el.closest("section");
    if (s && s.id) return s.id;
    if (el.closest("footer")) return "footer";
    if (el.closest("header")) return "nav";
    return "page";
  }

  ready(function () {
    /* ---------- Click events (delegated) ---------- */
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a, button");
      if (!a) return;
      var href = a.getAttribute("href") || "";
      var text = (a.textContent || "").trim().toLowerCase();
      var where = sectionOf(a);

      if (href.indexOf("wa.me") > -1 || href.toLowerCase().indexOf("whatsapp") > -1) {
        return track("whatsapp_click", { location: where });
      }
      if (href.toLowerCase().indexOf("mailto:") === 0) {
        return track("email_click", { location: where });
      }
      if (/plan (a|your) trip/.test(text)) {
        return track("plan_trip_click", { location: where });
      }
      if (text === "enquire") {
        var card = a.closest(".adv");
        var name = card && card.querySelector("h3") ? card.querySelector("h3").textContent.trim() : "";
        return track("adventure_enquire", { adventure: name, location: where });
      }
      if (text === "see the activities") {
        return track("cta_click", { cta: "see_activities", location: where });
      }
      // Journal / blog links (nav, footer, teaser, cards)
      if (a.closest("a.pcard") || href.indexOf("blog/") > -1 || /\/blog\/?$/.test(href)) {
        var slug = href.split("?")[0].split("#")[0].replace(/\/$/, "").split("/").pop();
        if (!slug || slug === "index.html" || slug === "blog") {
          return track("journal_index", { location: where });
        }
        return track("journal_open", { post: slug, location: where });
      }
    }, true);

    /* ---------- Activity section views (homepage) ---------- */
    var acts = document.querySelectorAll("#activities .act");
    if (acts.length && "IntersectionObserver" in window) {
      var seen = {};
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var k = en.target.querySelector(".kicker");
          var label = k ? k.textContent.trim() : "activity";
          if (seen[label]) return;
          seen[label] = 1;
          track("activity_view", { activity: label });
          io.unobserve(en.target);
        });
      }, { threshold: 0.5 });
      acts.forEach(function (el) { io.observe(el); });
    }

    /* ---------- Blog post read depth ---------- */
    var post = document.querySelector(".post-hero");
    if (post) {
      var slug = location.pathname.split("/").pop() || "post";
      var marks = [25, 50, 75, 100];
      var fired = {};
      var onScroll = function () {
        var h = document.documentElement;
        var scrollable = h.scrollHeight - h.clientHeight;
        if (scrollable <= 0) return;
        var pct = Math.min(100, Math.round((h.scrollTop || window.scrollY) / scrollable * 100));
        marks.forEach(function (m) {
          if (pct >= m && !fired[m]) {
            fired[m] = 1;
            track("post_scroll_depth", { post: slug, depth: m });
            if (m === 100) {
              track("post_read_complete", { post: slug });
              window.removeEventListener("scroll", onScroll);
            }
          }
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
  });
})();
