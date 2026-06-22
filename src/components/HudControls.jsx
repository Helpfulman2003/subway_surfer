import React from 'react';

export default function HudControls({ isMuted, onToggleMute, onVolumeChange, wallet }) {
  const shortAddr = wallet ? `${wallet.address.slice(0,6)}...${wallet.address.slice(-4)}` : '';

  return (
    <div id="hud-controls" style={{ display: 'flex' }}>
      <div id="btn-mute" onClick={onToggleMute} style={{ fontSize: '10px', fontWeight: 'bold' }}>
        {isMuted ? 'MUTE' : 'UNMUTE'}
      </div>
      <input 
        id="vol" 
        type="range" 
        min="0" 
        max="100" 
        defaultValue="70" 
        onChange={(e) => onVolumeChange(parseInt(e.target.value) / 100)} 
      />
      <div id="hud-tip">P: PAUSE</div>
      
      {wallet && (
        <div id="hud-wallet-info" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px', paddingLeft: '8px', borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00e676', boxShadow: '0 0 5px #00e676', flexShrink: 0 }}></div>
          <span id="hud-wallet-addr" style={{ fontSize: '11px', color: 'rgba(255,255,255,0.75)', letterSpacing: '0.5px' }}>
            {shortAddr}
          </span>
        </div>
      )}
    </div>
  );
}
