import React from 'react';

export default function LoadingScreen({
  progress,
  msg,
  isReady,
  wallet,
  feeStatus,
  onConnect,
  onPlay,
}) {
  const shortAddr = wallet
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : '';

  return (
    <div id='loading-screen'>
      <div className='load-logo-wrap'>
        <div className='load-logo'>
          SUBWAY <span>SURFERS</span>
        </div>
      </div>

      {!isReady ? (
        <div className='load-progress-area'>
          <div className='load-bar-track'>
            <div id='progress-bar' style={{ width: `${progress}%` }}></div>
          </div>
          <div id='loading-msg'>{msg}</div>
        </div>
      ) : (
        <>
          <div id='loading-msg' style={{ marginTop: '16px' }}>
            {msg}
          </div>
          <button id='btn-play' style={{ display: 'block' }} onClick={onPlay}>
            PLAY NOW
          </button>

          <div id='wallet-area'>
            {!wallet ? (
              <button id='btn-wallet' onClick={onConnect}>
                Connect Wallet
              </button>
            ) : (
              <a
                id='wallet-address'
                style={{ display: 'flex' }}
                href={`https://basescan.org/address/${wallet.address}`}
                target='_blank'
                rel='noreferrer'
              >
                <div className='wallet-dot'></div>
                <span>{shortAddr}</span>
              </a>
            )}

            {feeStatus && (
              <div id='fee-badge' style={{ display: 'flex' }}>
                <div
                  className={`fee-dot ${feeStatus === 'paying' ? 'warn' : feeStatus === 'ok' ? 'ok' : 'skip'}`}
                ></div>
                <span>
                  {feeStatus === 'paying'
                    ? 'Paying fee...'
                    : feeStatus === 'ok'
                      ? 'Fee paid'
                      : 'Fee skipped'}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
