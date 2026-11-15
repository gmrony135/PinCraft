import { ArrowUpRight, Check, Layers3, Link2, Sparkles } from 'lucide-react';

// A lightweight, looping illustration for the homepage hero. It is intentionally
// marked as illustrative so no sample account activity is mistaken for real data.
export default function HomeHeroAnimation() {
  return (
    <figure className="home-motion" data-testid="home-hero-motion">
      <div className="home-motion-stage" aria-hidden="true">
        <div className="home-motion-glow" />
        <div className="home-motion-orbit home-motion-orbit--one" />
        <div className="home-motion-orbit home-motion-orbit--two" />
        <div className="home-motion-spark home-motion-spark--one">✦</div>
        <div className="home-motion-spark home-motion-spark--two">✦</div>

        <div className="home-motion-window">
          <div className="home-motion-windowbar">
            <span className="home-motion-dots"><i /><i /><i /></span>
            <span className="home-motion-window-label"><Layers3 size={12} /> ARTICLE WORKSPACE</span>
            <span className="home-motion-private">PRIVATE DRAFT</span>
          </div>
          <div className="home-motion-content">
            <div className="home-motion-kicker"><Sparkles size={12} /> EDITORIAL PREVIEW</div>
            <h2>Make every idea<br /><span>clear and useful.</span></h2>
            <p className="home-motion-description">A thoughtful article, structured for readers first.</p>

            <div className="home-motion-art">
              <svg viewBox="0 0 560 205" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="home-cover-sky" x1="280" y1="0" x2="280" y2="205" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FDE8D8" />
                    <stop offset="1" stopColor="#E5F0E8" />
                  </linearGradient>
                  <linearGradient id="home-cover-hill" x1="130" y1="98" x2="250" y2="206" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#B9D4C1" />
                    <stop offset="1" stopColor="#759783" />
                  </linearGradient>
                  <linearGradient id="home-cover-hill2" x1="420" y1="104" x2="383" y2="209" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#A9C7B4" />
                    <stop offset="1" stopColor="#648772" />
                  </linearGradient>
                </defs>
                <rect width="560" height="205" rx="18" fill="url(#home-cover-sky)" />
                <circle className="home-motion-sun" cx="426" cy="55" r="27" fill="#FFF8E8" />
                <path d="M0 137C72 103 130 111 203 142C284 177 340 127 403 119C466 111 521 130 560 114V205H0V137Z" fill="url(#home-cover-hill)" />
                <path d="M0 167C83 137 149 151 229 170C327 194 374 144 454 148C500 150 533 161 560 154V205H0V167Z" fill="url(#home-cover-hill2)" />
                <g transform="translate(82 52)">
                  <g className="home-motion-leaf home-motion-leaf--one">
                    <path d="M12 96C5 64 12 33 43 4C51 34 47 68 20 97" fill="#48725B" />
                    <path d="M18 93L38 17" stroke="#E4F0E6" strokeWidth="2" strokeLinecap="round" />
                    <path d="M17 70C4 61 2 49 4 38C16 43 22 53 17 70Z" fill="#6D987A" />
                    <path d="M24 53C39 48 45 38 47 27C34 30 26 39 24 53Z" fill="#5A8668" />
                    <path d="M13 87C-2 82-8 72-9 60C5 63 13 73 13 87Z" fill="#7EAA87" />
                  </g>
                </g>
                <g transform="translate(463 77) scale(.72)">
                  <g className="home-motion-leaf home-motion-leaf--two">
                    <path d="M12 96C5 64 12 33 43 4C51 34 47 68 20 97" fill="#48725B" />
                    <path d="M18 93L38 17" stroke="#E4F0E6" strokeWidth="2" strokeLinecap="round" />
                    <path d="M17 70C4 61 2 49 4 38C16 43 22 53 17 70Z" fill="#6D987A" />
                    <path d="M24 53C39 48 45 38 47 27C34 30 26 39 24 53Z" fill="#5A8668" />
                  </g>
                </g>
                <path d="M0 189C101 181 185 192 272 188C376 183 444 178 560 188V205H0V189Z" fill="#5E8068" opacity=".38" />
                <rect x="235" y="157" width="92" height="9" rx="4.5" fill="#FFF8F0" opacity=".75" />
              </svg>
              <span className="home-motion-art-label">FEATURED IMAGE · 1200 × 630</span>
            </div>

            <div className="home-motion-progress" aria-hidden="true"><span /><span /><span /><span /></div>
            <div className="home-motion-footer">
              <span><Check size={13} /> H1 + four sections</span>
              <span><Check size={13} /> FAQ + SEO fields</span>
            </div>
          </div>
        </div>

        <div className="home-motion-chip home-motion-chip--images">
          <span className="home-motion-chip-icon"><Sparkles size={15} /></span>
          <span><strong>3 original images</strong><small>Cover + section scenes</small></span>
        </div>
        <div className="home-motion-chip home-motion-chip--links">
          <span className="home-motion-chip-icon home-motion-chip-icon--green"><Link2 size={15} /></span>
          <span><strong>Live internal links</strong><small>Selected from your blog</small></span>
        </div>
        <div className="home-motion-chip home-motion-chip--review">
          <span className="home-motion-check"><Check size={14} /></span>
          <span><strong>Review before publish</strong><small>Your approval stays required</small></span>
          <ArrowUpRight size={13} className="home-motion-chip-arrow" />
        </div>
      </div>
      <figcaption className="home-motion-caption">Animated article-workflow illustration · preview only, not live account activity</figcaption>
    </figure>
  );
}
