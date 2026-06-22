import React from 'react';

export default function GameOverScreen({
  score,
  coins,
  combo,
  feeStatus,
  txHash,
  onRestart,
}) {
  return (
    <div id='game-over-screen' style={{ display: 'flex' }}>
      <div className='go-title' style={{ marginTop: '20px' }}>WASTED</div>
      <div className='go-divider'></div>

      <div className='go-stats'>
        <div className='go-stat'>
          <div className='go-stat-label'>SCORE</div>
          <div className='go-stat-val' id='final-score'>
            {score}
          </div>
        </div>
        <div className='go-stat'>
          <div className='go-stat-label'>COINS</div>
          <div className='go-stat-val coins' id='final-coins'>
            {coins}
          </div>
        </div>
        <div className='go-stat'>
          <div className='go-stat-label'>COMBO</div>
          <div className='go-stat-val combo' id='final-combo'>
            x{combo}
          </div>
        </div>
      </div>

      {txHash && (
        <div id='go-tx-wrap' style={{ display: 'block' }}>
          <a
            id='go-tx-link'
            href={`https://basescan.org/tx/${txHash}`}
            target='_blank'
            rel='noreferrer'
          >
            View TX
          </a>
        </div>
      )}

      <div className='go-buttons'>
        <button
          className='go-btn go-btn-restart'
          id='btn-restart'
          onClick={onRestart}
        >
          PLAY AGAIN
        </button>
      </div>
    </div>
  );
}
