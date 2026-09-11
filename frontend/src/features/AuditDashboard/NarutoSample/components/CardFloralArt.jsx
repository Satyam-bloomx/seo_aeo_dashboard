import React from 'react';

/**
 * Traditional Japanese floral, botanical, and landscape watercolor art
 * for the 4 card backgrounds.
 */

// 1. Cherry Blossom (Sakura) branches & falling petals for PageSpeed Card
export function SakuraBlossoms() {
  return (
    <svg 
      className="absolute bottom-0 right-0 w-60 h-44 pointer-events-none opacity-85 z-0" 
      viewBox="0 0 240 180" 
      fill="none"
    >
      {/* Main Gnarled Sakura Branch */}
      <path 
        d="M240,180 C200,150 170,135 140,115 C110,95 85,82 55,78 C35,75 20,82 5,72" 
        stroke="#854d0e" 
        strokeWidth="3.6" 
        strokeLinecap="round" 
        opacity="0.65" 
      />
      <path 
        d="M170,135 C160,115 145,100 128,95" 
        stroke="#854d0e" 
        strokeWidth="2.4" 
        strokeLinecap="round" 
        opacity="0.55" 
      />
      <path 
        d="M110,95 C100,78 88,72 70,68" 
        stroke="#854d0e" 
        strokeWidth="2" 
        strokeLinecap="round" 
        opacity="0.5" 
      />
      <path 
        d="M55,78 C48,65 38,60 25,62" 
        stroke="#854d0e" 
        strokeWidth="1.6" 
        strokeLinecap="round" 
        opacity="0.45" 
      />

      {/* Flower Cluster 1 (Main node at 128, 95) */}
      <g transform="translate(128, 95)" opacity="0.85">
        <circle cx="0" cy="0" r="14" fill="#fbcfe8" opacity="0.5" />
        {/* 5 Petals */}
        <ellipse cx="0" cy="-9" rx="5" ry="7" fill="#f472b6" opacity="0.6" />
        <ellipse cx="8.5" cy="-2.8" rx="5" ry="7" fill="#f472b6" opacity="0.6" transform="rotate(72 8.5 -2.8)" />
        <ellipse cx="5.3" cy="7.3" rx="5" ry="7" fill="#f472b6" opacity="0.6" transform="rotate(144 5.3 7.3)" />
        <ellipse cx="-5.3" cy="7.3" rx="5" ry="7" fill="#f472b6" opacity="0.6" transform="rotate(216 -5.3 7.3)" />
        <ellipse cx="-8.5" cy="-2.8" rx="5" ry="7" fill="#f472b6" opacity="0.6" transform="rotate(288 -8.5 -2.8)" />
        {/* Core Pistil */}
        <circle cx="0" cy="0" r="3.5" fill="#be123c" opacity="0.75" />
        <circle cx="0" cy="0" r="1.5" fill="#fef08a" />
      </g>

      {/* Flower Cluster 2 (Upper node at 70, 68) */}
      <g transform="translate(70, 68)" opacity="0.8">
        <circle cx="0" cy="0" r="11" fill="#fbcfe8" opacity="0.45" />
        <ellipse cx="0" cy="-7" rx="4" ry="5.5" fill="#fb7185" opacity="0.55" />
        <ellipse cx="6.6" cy="-2.1" rx="4" ry="5.5" fill="#fb7185" opacity="0.55" transform="rotate(72 6.6 -2.1)" />
        <ellipse cx="4.1" cy="5.7" rx="4" ry="5.5" fill="#fb7185" opacity="0.55" transform="rotate(144 4.1 5.7)" />
        <ellipse cx="-4.1" cy="5.7" rx="4" ry="5.5" fill="#fb7185" opacity="0.55" transform="rotate(216 -4.1 5.7)" />
        <ellipse cx="-6.6" cy="-2.1" rx="4" ry="5.5" fill="#fb7185" opacity="0.55" transform="rotate(288 -6.6 -2.1)" />
        <circle cx="0" cy="0" r="2.8" fill="#be123c" opacity="0.7" />
        <circle cx="0" cy="0" r="1.2" fill="#fef08a" />
      </g>

      {/* Flower Cluster 3 (End node at 25, 62) */}
      <g transform="translate(25, 62)" opacity="0.75">
        <circle cx="0" cy="0" r="9" fill="#fce7f3" opacity="0.5" />
        <ellipse cx="0" cy="-5.5" rx="3.2" ry="4.5" fill="#f43f5e" opacity="0.5" />
        <ellipse cx="5.2" cy="-1.7" rx="3.2" ry="4.5" fill="#f43f5e" opacity="0.5" transform="rotate(72 5.2 -1.7)" />
        <ellipse cx="3.2" cy="4.5" rx="3.2" ry="4.5" fill="#f43f5e" opacity="0.5" transform="rotate(144 3.2 4.5)" />
        <ellipse cx="-3.2" cy="4.5" rx="3.2" ry="4.5" fill="#f43f5e" opacity="0.5" transform="rotate(216 -3.2 4.5)" />
        <ellipse cx="-5.2" cy="-1.7" rx="3.2" ry="4.5" fill="#f43f5e" opacity="0.5" transform="rotate(288 -5.2 -1.7)" />
        <circle cx="0" cy="0" r="2.2" fill="#9f1239" opacity="0.7" />
      </g>

      {/* Flower Bud at 150, 125 */}
      <g transform="translate(150, 125)" opacity="0.7">
        <circle cx="0" cy="0" r="8" fill="#fbcfe8" opacity="0.4" />
        <ellipse cx="0" cy="-4.5" rx="3" ry="4" fill="#fb7185" opacity="0.6" />
        <ellipse cx="4" cy="2" rx="3" ry="4" fill="#fb7185" opacity="0.6" transform="rotate(120 4 2)" />
        <ellipse cx="-4" cy="2" rx="3" ry="4" fill="#fb7185" opacity="0.6" transform="rotate(240 -4 2)" />
        <circle cx="0" cy="0" r="2" fill="#9f1239" opacity="0.6" />
      </g>

      {/* Floating & Falling Sakura Petals */}
      <g opacity="0.7">
        <path d="M190,160 Q185,152 180,157 Q185,165 190,160 Z" fill="#fb7185" opacity="0.6" transform="rotate(25 185 158)" />
        <path d="M135,155 Q130,148 125,153 Q130,160 135,155 Z" fill="#f472b6" opacity="0.55" transform="rotate(-40 130 154)" />
        <path d="M95,145 Q90,138 85,143 Q90,150 95,145 Z" fill="#fb7185" opacity="0.5" transform="rotate(15 90 144)" />
        <path d="M60,135 Q55,128 50,133 Q55,140 60,135 Z" fill="#fda4af" opacity="0.45" transform="rotate(-20 55 134)" />
        <path d="M30,120 Q26,114 22,118 Q26,124 30,120 Z" fill="#fb7185" opacity="0.4" transform="rotate(35 26 119)" />
      </g>
    </svg>
  );
}

// 2. Bamboo, Mountain Pagoda & Mist for OpenAI Card
export function BambooPagoda() {
  return (
    <svg 
      className="absolute bottom-0 right-0 w-60 h-44 pointer-events-none opacity-80 z-0" 
      viewBox="0 0 240 180" 
      fill="none"
    >
      {/* Rising Sun / Moon Silhouette in Soft Azure */}
      <circle cx="175" cy="55" r="32" fill="#38bdf8" opacity="0.12" />

      {/* Distant Mountain Ridges */}
      <path 
        d="M60,150 Q110,95 160,130 Q190,105 240,140 L240,180 L60,180 Z" 
        fill="#bae6fd" 
        opacity="0.25" 
      />

      {/* Bamboo Stalk 1 */}
      <rect x="200" y="35" width="4.5" height="145" rx="2" fill="#0284c7" opacity="0.32" />
      <line x1="198" y1="65" x2="206" y2="65" stroke="#0369a1" strokeWidth="2" opacity="0.4" />
      <line x1="198" y1="100" x2="206" y2="100" stroke="#0369a1" strokeWidth="2" opacity="0.4" />
      <line x1="198" y1="135" x2="206" y2="135" stroke="#0369a1" strokeWidth="2" opacity="0.4" />

      {/* Bamboo Stalk 2 */}
      <rect x="216" y="55" width="3.5" height="125" rx="1.5" fill="#0284c7" opacity="0.28" />
      <line x1="214" y1="85" x2="221" y2="85" stroke="#0369a1" strokeWidth="1.8" opacity="0.35" />
      <line x1="214" y1="120" x2="221" y2="120" stroke="#0369a1" strokeWidth="1.8" opacity="0.35" />

      {/* Bamboo Stalk 3 (Thin) */}
      <rect x="186" y="70" width="3" height="110" rx="1.5" fill="#0284c7" opacity="0.22" />
      <line x1="184" y1="95" x2="190" y2="95" stroke="#0369a1" strokeWidth="1.5" opacity="0.3" />
      <line x1="184" y1="130" x2="190" y2="130" stroke="#0369a1" strokeWidth="1.5" opacity="0.3" />

      {/* Bamboo Leaves */}
      <path d="M200,35 Q185,25 170,32 Q182,30 200,35 Z" fill="#0284c7" opacity="0.35" />
      <path d="M203,35 Q212,20 226,26 Q214,24 203,35 Z" fill="#0284c7" opacity="0.3" />
      <path d="M216,55 Q205,42 192,48 Q202,46 216,55 Z" fill="#0284c7" opacity="0.3" />
      <path d="M219,55 Q230,44 240,50 Q230,48 219,55 Z" fill="#0284c7" opacity="0.25" />
      <path d="M186,70 Q174,58 162,64 Q172,62 186,70 Z" fill="#0284c7" opacity="0.28" />
      <path d="M200,65 Q188,55 176,60 Q186,58 200,65 Z" fill="#0284c7" opacity="0.3" />
      <path d="M200,100 Q186,92 174,96 Q184,94 200,100 Z" fill="#0284c7" opacity="0.3" />

      {/* Flowing Cloud / Mist Layers */}
      <ellipse cx="110" cy="155" rx="50" ry="12" fill="#7dd3fc" opacity="0.18" />
      <ellipse cx="60" cy="165" rx="40" ry="10" fill="#7dd3fc" opacity="0.15" />
      <ellipse cx="160" cy="168" rx="35" ry="9" fill="#7dd3fc" opacity="0.12" />
    </svg>
  );
}

// 3. Purple Watercolor Bonsai Pine Tree for Perplexity Card
export function PineBonsaiPurple() {
  return (
    <svg 
      className="absolute bottom-0 right-0 w-60 h-44 pointer-events-none opacity-85 z-0" 
      viewBox="0 0 240 180" 
      fill="none"
    >
      {/* Pine Needle Tuft Clusters */}
      <circle cx="195" cy="115" r="24" fill="#7c3aed" opacity="0.35" />
      <circle cx="145" cy="85" r="30" fill="#7c3aed" opacity="0.4" />
      <circle cx="85" cy="108" r="22" fill="#7c3aed" opacity="0.3" />
      <circle cx="50" cy="128" r="18" fill="#7c3aed" opacity="0.25" />
      <circle cx="175" cy="138" r="26" fill="#7c3aed" opacity="0.35" />

      {/* High-detail Needle Tufts (Inner rings) */}
      <circle cx="195" cy="115" r="16" fill="#6d28d9" opacity="0.3" />
      <circle cx="145" cy="85" r="20" fill="#6d28d9" opacity="0.35" />
      <circle cx="85" cy="108" r="14" fill="#6d28d9" opacity="0.25" />

      {/* Bonsai Trunk & Spreading Branches */}
      <path 
        d="M240,180 Q165,158 135,115 Q115,95 85,108 M135,115 Q105,128 65,135 M165,158 Q195,138 215,115" 
        stroke="#4c1d95" 
        strokeWidth="4.2" 
        strokeLinecap="round" 
        opacity="0.7" 
      />
      <path 
        d="M135,115 Q145,95 145,85" 
        stroke="#4c1d95" 
        strokeWidth="3.2" 
        strokeLinecap="round" 
        opacity="0.65" 
      />

      {/* Additional smaller pine tree on left corner */}
      <circle cx="20" cy="155" r="15" fill="#7c3aed" opacity="0.2" />
      <path d="M0,175 Q15,165 20,155" stroke="#4c1d95" strokeWidth="2.4" strokeLinecap="round" opacity="0.4" />

      {/* Purple Mist Layers */}
      <ellipse cx="120" cy="165" rx="55" ry="10" fill="#c084fc" opacity="0.15" />
    </svg>
  );
}

// 4. Torii Gate, Flying Cranes & Misty Peaks for SerpAPI Card
export function ToriiCranesIndigo() {
  return (
    <svg 
      className="absolute bottom-0 right-0 w-60 h-44 pointer-events-none opacity-85 z-0" 
      viewBox="0 0 240 180" 
      fill="none"
    >
      {/* Mountain Silhouettes */}
      <path 
        d="M40,165 Q90,110 140,145 Q180,100 230,145 L240,180 L40,180 Z" 
        fill="#c7d2fe" 
        opacity="0.35" 
      />

      {/* Japanese Torii Gate on Right */}
      <g transform="translate(180, 85)" opacity="0.65">
        {/* Curved Top Beam (Kasagi) */}
        <path d="M-10,-5 Q20,-16 50,-5" stroke="#3730a3" strokeWidth="5.5" strokeLinecap="round" fill="none" />
        {/* Second Horizontal Beam (Nuki) */}
        <line x1="-4" y1="8" x2="44" y2="8" stroke="#3730a3" strokeWidth="3" strokeLinecap="round" />
        {/* Left Pillar (Hashira) */}
        <rect x="2" y="-4" width="4.5" height="90" rx="1.5" fill="#312e81" />
        {/* Right Pillar */}
        <rect x="34" y="-4" width="4.5" height="90" rx="1.5" fill="#312e81" />
        {/* Base Wedges */}
        <rect x="0" y="80" width="8.5" height="5" rx="1" fill="#1e1b4b" />
        <rect x="32" y="80" width="8.5" height="5" rx="1" fill="#1e1b4b" />
      </g>

      {/* Soaring Cranes (Tancho) */}
      {/* Crane 1 (Foreground) */}
      <g transform="translate(60, 45)" opacity="0.45">
        <path d="M0,0 Q12,-15 25,-7 Q30,-4 20,6 Q10,14 0,0 Z" fill="#6366f1" />
        <path d="M25,-7 L45,-14 M25,-7 L40,0" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" />
        <path d="M0,0 L-10,6" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* Crane 2 (Distant) */}
      <g transform="translate(100, 65)" opacity="0.35">
        <path d="M0,0 Q9,-11 19,-5 Q23,-3 15,5 Q8,11 0,0 Z" fill="#6366f1" />
        <path d="M19,-5 L34,-10 M19,-5 L30,0" stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M0,0 L-8,5" stroke="#4f46e5" strokeWidth="1.2" strokeLinecap="round" />
      </g>

      {/* Indigo Mist Layers */}
      <ellipse cx="100" cy="155" rx="55" ry="11" fill="#818cf8" opacity="0.18" />
      <ellipse cx="160" cy="165" rx="45" ry="9" fill="#818cf8" opacity="0.14" />
      <ellipse cx="50" cy="168" rx="35" ry="8" fill="#818cf8" opacity="0.1" />
    </svg>
  );
}
