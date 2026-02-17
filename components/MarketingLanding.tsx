import React from 'react';
import { Icons } from './ui/Icons';

const APP_STORE_URL = 'https://apps.apple.com/kz/app/lumina-reader/id6755960016';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.yersat.LuminaReader';

export function MarketingLanding() {
  return (
    <div
      className="h-full w-full overflow-hidden"
      style={{
        fontFamily:
          '"Avenir Next", Avenir, Futura, "Gill Sans", ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <div
        className="h-full w-full"
        style={{
          background:
            'radial-gradient(1100px 520px at 18% 22%, rgba(255, 243, 199, 0.55), transparent 60%), radial-gradient(900px 520px at 78% 28%, rgba(199, 255, 247, 0.45), transparent 62%), linear-gradient(180deg, #0b0f17 0%, #0a0d13 100%)',
        }}
      >
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center px-8">
          <div className="flex w-full flex-col items-center gap-8">
            <div className="flex items-center gap-4">
              <div
                className="grid h-14 w-14 place-items-center rounded-2xl"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,223,140,0.95) 0%, rgba(255,255,255,0.85) 40%, rgba(140,255,243,0.95) 100%)',
                  boxShadow:
                    '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12) inset',
                }}
              >
                <span
                  className="text-xl font-semibold"
                  style={{ color: '#0b0f17', letterSpacing: '-0.02em' }}
                >
                  L
                </span>
              </div>
              <div className="flex flex-col">
                <div className="text-2xl font-semibold text-white">Lumina Reader</div>
                <div className="text-sm text-white/70">Read EPUB books and articles.</div>
              </div>
            </div>

            <div className="flex w-full flex-col items-center gap-3 text-center">
              <h1
                className="text-balance text-4xl font-semibold text-white sm:text-5xl"
                style={{ letterSpacing: '-0.03em' }}
              >
                A calm, focused reading experience.
              </h1>
              <p className="max-w-2xl text-pretty text-base text-white/75 sm:text-lg">
                Import EPUB files, personalize fonts and themes, and keep your place across sessions.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex w-72 items-center justify-center gap-3 rounded-2xl px-5 py-4 text-white transition"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)',
                  boxShadow:
                    '0 20px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12) inset',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <Icons.Apple size={22} className="text-white" />
                <span className="text-base font-semibold">Download on the App Store</span>
              </a>

              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex w-72 items-center justify-center gap-3 rounded-2xl px-5 py-4 text-white transition"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)',
                  boxShadow:
                    '0 20px 50px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12) inset',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <Icons.Google size={22} className="text-white" />
                <span className="text-base font-semibold">Get it on Google Play</span>
              </a>
            </div>

            <div className="flex items-center gap-4 text-xs text-white/55">
              <a className="underline decoration-white/25 underline-offset-4" href="/privacy-policy.html">
                Privacy
              </a>
              <a className="underline decoration-white/25 underline-offset-4" href="/terms-of-use.html">
                Terms
              </a>
              <a className="underline decoration-white/25 underline-offset-4" href="/support.html">
                Support
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

