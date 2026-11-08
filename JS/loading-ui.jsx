import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const pulse = "motion-safe:animate-pulse rounded-full bg-slate-200";

function Bar({ className = "" }) {
  return <div className={`${pulse} ${className}`} />;
}

function NavigationSkeleton({ admin }) {
  const links = admin
    ? ["Sample routes", "Map preview", "Back to journey planner"]
    : ["Routes", "Map preview", "Arrivals", "Service information", "Route management"];

  return (
    <header className="bg-[#0b6e4f] shadow-md">
      <div className="mx-auto flex min-h-[70px] max-w-[1160px] items-center justify-between gap-[18px] px-6 max-[800px]:items-start max-[800px]:flex-col max-[800px]:py-3 max-[560px]:px-[18px]">
        <div className="flex min-h-[42px] items-center gap-2">
          <Bar className="h-5 w-12 bg-white/35" />
          <Bar className="h-4 w-24 bg-white/20" />
        </div>
        <nav className="flex flex-wrap items-center justify-end gap-x-[22px] gap-y-3 max-[800px]:justify-start max-[800px]:gap-x-[18px] max-[800px]:gap-y-3 max-[560px]:grid max-[560px]:grid-cols-[max-content_max-content] max-[560px]:gap-x-3 max-[560px]:gap-y-1">
          {links.map((label, index) => {
            const button = index === links.length - 1;
            const width = ["Service information", "Back to journey planner", "Route management"].includes(label)
              ? "w-28"
              : label === "Sample routes" ? "w-20" : "w-16";

            return (
              <div
                key={label}
                className={button
                  ? "flex min-h-[42px] items-center rounded-lg bg-white/15 px-4 max-[560px]:col-span-2 max-[560px]:justify-self-start"
                  : "flex min-h-[40px] items-center gap-2"}
              >
                {!button && <Bar className="h-3 w-3 bg-white/25" />}
                <Bar className={`h-3 ${width} bg-white/25`} />
              </div>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function FooterSkeleton() {
  return (
    <footer className="bg-[#17201d] py-11 text-white max-[560px]:py-[26px]">
      <div className="mx-auto max-w-[1160px] px-6 max-[560px]:relative max-[560px]:left-1/2 max-[560px]:w-screen max-[560px]:max-w-none max-[560px]:-translate-x-1/2 max-[560px]:px-0">
        <div className="overflow-hidden rounded-[18px] bg-[#202a26] shadow-xl max-[560px]:rounded-none">
          <div className="flex min-h-[190px] items-end justify-between gap-8 rounded-b-2xl bg-[#0b6e4f] p-[30px_34px] max-[560px]:min-h-[190px] max-[560px]:flex-col max-[560px]:items-start max-[560px]:gap-6 max-[560px]:px-[22px] max-[560px]:py-[25px]">
            <Bar className="h-5 w-36 bg-white/30" />
            <div className="grid gap-2">
              <Bar className="h-2.5 w-16 bg-white/25" />
              <Bar className="h-4 w-36 bg-white/30" />
            </div>
          </div>
          <div className="p-[34px] max-[560px]:px-[22px] max-[560px]:py-[25px]">
            <div className="grid grid-cols-4 gap-7 pb-[30px] max-[560px]:grid-cols-2 max-[560px]:gap-x-[18px] max-[560px]:gap-y-6">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="grid content-start justify-items-start gap-3">
                  <Bar className="mb-1 h-3 w-24 bg-white/25" />
                  <Bar className="h-3 w-20 bg-white/15" />
                  <Bar className="h-3 w-24 bg-white/15" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-white/15 pt-[18px] max-[560px]:items-start max-[560px]:flex-col">
              <Bar className="h-3 w-52 bg-white/15" />
              <Bar className="h-3 w-24 bg-white/15" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function HomeSkeleton({ reduceMotion }) {
  return (
    <>
      <main>
        <section className="bg-gradient-to-br from-[#0b6e4f] to-[#084c37] py-[58px] text-white max-[560px]:py-[42px]">
          <div className="mx-auto max-w-[1000px] px-6 max-[560px]:px-[18px]">
            <Bar className="mb-3 h-3 w-48 bg-white/20" />
            <Bar className="mb-[30px] h-10 w-3/4 max-w-[600px] rounded-lg bg-white/25 sm:h-12" />
            <div className="grid items-end gap-[14px] rounded-xl border border-white/30 bg-white p-5 text-[#1c2b26] shadow-2xl sm:grid-cols-[1fr_1fr_auto] max-[560px]:p-4">
              {[0, 1].map(item => (
                <div key={item} className="grid gap-2">
                  <Bar className="h-3 w-24 bg-slate-200" />
                  <Bar className="h-[46px] rounded-lg bg-slate-100" />
                </div>
              ))}
              <Bar className="h-[46px] rounded-lg bg-amber-300 max-[560px]:w-full" />
            </div>
          </div>
        </section>

        <section className="py-[58px] max-[560px]:py-[42px]">
          <div className="mx-auto max-w-[1160px] px-6 max-[560px]:px-[18px]">
            <Bar className="mb-2 h-3 w-28 bg-emerald-100" />
            <Bar className="mb-[22px] h-7 w-48 bg-slate-200" />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(245px,1fr))] gap-4 max-[560px]:grid-cols-1">
              {[0, 1, 2].map(item => (
                <motion.div
                  key={item}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={{ duration: reduceMotion ? 0.15 : 0.3, delay: reduceMotion ? 0 : item * 0.07 }}
                  className="min-h-[170px] rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <Bar className="mb-3 h-4 w-3/4 bg-slate-200" />
                  <Bar className="mb-5 h-3 w-1/3 bg-slate-100" />
                  <div className="flex flex-wrap gap-2">
                    <Bar className="h-6 w-24 bg-emerald-50" />
                    <Bar className="h-6 w-20 bg-emerald-50" />
                    <Bar className="h-6 w-16 bg-emerald-50" />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#eaf0ed] py-[58px] max-[560px]:py-[42px]">
          <div className="mx-auto max-w-[1160px] px-6 max-[560px]:px-[18px]">
            <Bar className="mb-2 h-3 w-32 bg-emerald-100" />
            <Bar className="mb-[22px] h-7 w-40 bg-slate-200" />
            <div className="grid grid-cols-[minmax(0,1.8fr)_minmax(240px,0.75fr)] gap-[18px] max-[800px]:grid-cols-1">
              <Bar className="h-[430px] rounded-xl bg-slate-200 max-[800px]:h-[390px] max-[560px]:h-[340px]" />
              <Bar className="h-[430px] rounded-xl bg-white max-[800px]:h-[280px]" />
            </div>
          </div>
        </section>

        <section className="py-[58px] max-[560px]:py-[42px]">
          <div className="mx-auto max-w-[1160px] px-6 max-[560px]:px-[18px]">
            <Bar className="mb-2 h-3 w-28 bg-emerald-100" />
            <Bar className="mb-[22px] h-7 w-56 bg-slate-200" />
            <div className="rounded-xl border border-slate-200 bg-white p-[22px] shadow-sm max-[560px]:p-[17px]">
              <div className="mb-4 grid grid-cols-2 gap-[14px] max-[560px]:grid-cols-1">
                {[0, 1].map(item => (
                  <div key={item} className="grid gap-2">
                    <Bar className="h-3 w-20 bg-slate-200" />
                    <Bar className="h-[46px] rounded-lg bg-slate-100" />
                  </div>
                ))}
              </div>
              <div className="mb-3 flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4 max-[560px]:items-start max-[560px]:flex-col">
                <div className="grid w-full gap-2">
                  <Bar className="h-4 w-2/3 bg-slate-200" />
                  <Bar className="h-3 w-1/2 bg-slate-100" />
                </div>
                <Bar className="h-5 w-24 bg-emerald-100" />
              </div>
              <Bar className="h-3 w-4/5 max-w-lg bg-slate-100" />
            </div>
          </div>
        </section>

        <section className="bg-[#eaf0ed] py-[58px] max-[560px]:py-[42px]">
          <div className="mx-auto max-w-[1160px] px-6 max-[560px]:px-[18px]">
            <Bar className="mb-2 h-3 w-36 bg-emerald-100" />
            <Bar className="mb-[22px] h-7 w-52 bg-slate-200" />
            <Bar className="h-[90px] rounded-lg border border-slate-200 bg-white" />
          </div>
        </section>
      </main>
      <FooterSkeleton />
    </>
  );
}

function AdminSkeleton() {
  return (
    <>
      <main className="min-h-[calc(100vh-146px)]">
        <section className="bg-[#edf3ef] py-[42px]">
          <div className="mx-auto max-w-[1160px] px-6 max-[560px]:px-[18px]">
            <Bar className="h-10 w-72 max-w-full rounded-lg bg-slate-200" />
          </div>
        </section>
        <section className="pb-[58px] pt-[30px]">
          <div className="mx-auto grid max-w-[1160px] gap-[18px] px-6 max-[560px]:px-[18px]">
            <section className="rounded-xl border border-slate-200 bg-white p-[22px] shadow-sm max-[560px]:p-[17px]">
              <Bar className="mb-2 h-3 w-28 bg-emerald-100" />
              <Bar className="mb-[18px] h-7 w-52 bg-slate-200" />
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Bar className="h-3 w-24 bg-slate-100" />
                  <Bar className="h-[46px] rounded-lg bg-slate-100" />
                </div>
                <div className="grid gap-2">
                  <Bar className="h-3 w-36 bg-slate-100" />
                  <Bar className="h-[90px] rounded-lg bg-slate-100" />
                  <Bar className="h-3 w-full max-w-xl bg-slate-100" />
                </div>
                <Bar className="h-[42px] w-32 rounded-lg bg-amber-300" />
              </div>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-[22px] shadow-sm max-[560px]:p-[17px]">
              <div className="mb-[18px] flex items-center justify-between gap-4">
                <div>
                  <Bar className="mb-2 h-3 w-28 bg-emerald-100" />
                  <Bar className="h-7 w-52 bg-slate-200" />
                </div>
                <Bar className="h-3 w-14 bg-slate-100" />
              </div>
              {[0, 1, 2].map(item => (
                <div key={item} className="mb-[10px] flex items-center justify-between gap-[18px] rounded-lg border border-slate-200 p-[15px] max-[560px]:items-start max-[560px]:flex-col">
                  <div className="grid min-w-0 flex-1 gap-2">
                    <Bar className="h-4 w-3/4 bg-slate-200" />
                    <Bar className="h-3 w-full max-w-72 bg-slate-100" />
                  </div>
                  <div className="flex gap-2 max-[560px]:self-end">
                    <Bar className="h-10 w-10 rounded-lg bg-slate-100" />
                    <Bar className="h-10 w-10 rounded-lg bg-slate-100" />
                  </div>
                </div>
              ))}
            </section>
          </div>
        </section>
      </main>
      <FooterSkeleton />
    </>
  );
}

function PageSkeleton({ page }) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let timer;
    const startedAt = performance.now();
    const dismiss = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), Math.max(0, 500 - (performance.now() - startedAt)));
    };
    const maximumWait = window.setTimeout(() => setVisible(false), 1800);
    window.addEventListener("jutc:ready", dismiss, { once: true });
    if (document.documentElement.dataset.jutcReady === 'true') dismiss();

    return () => {
      clearTimeout(timer);
      clearTimeout(maximumWait);
      window.removeEventListener("jutc:ready", dismiss);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-busy="true"
      aria-label="Loading page"
      role="status"
      className="fixed inset-0 z-[3000] overflow-y-auto bg-[#f5f7f6] text-[#1c2b26]"
    >
      <span className="sr-only">
        {page === "admin" ? "Loading route management" : "Loading the journey planner"}
      </span>
      <NavigationSkeleton admin={page === "admin"} />
      {page === "admin" ? <AdminSkeleton /> : <HomeSkeleton reduceMotion={reduceMotion} />}
    </div>
  );
}

export function mountLoadingSkeleton(page) {
  const target = document.getElementById("loading-root");
  if (!target) throw new Error("The page loading container is missing.");
  createRoot(target).render(<PageSkeleton page={page} />);
}
