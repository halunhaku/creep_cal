import React from 'react';

export default function BackgroundElements() {
  return (
    <>
      {/* Faint accent glow — top */}
      <div className="fixed left-1/2 top-[-14rem] h-[22rem] w-[52rem] -translate-x-1/2 blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, var(--glow), transparent 65%)' }} />
      {/* Faint accent glow — bottom right */}
      <div className="fixed bottom-[-16rem] right-[-10rem] h-[30rem] w-[40rem] blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, var(--glow), transparent 65%)' }} />
    </>
  );
}
