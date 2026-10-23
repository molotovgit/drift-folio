import './styles/base.css'
import { detectGpu, type GpuNavigator } from './core/engine'
import { Game } from './game/game'
import { GameOptions } from './game/options'
import { LoadingScreen } from './ui/loading'
import { skipOverlay } from './ui/skip'

const loading = new LoadingScreen()

/**
 * Entry point: wire the "Skip the game" link, check the GPU, start the game.
 * Any failure falls back to the text version of the portfolio.
 */
async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
  document.querySelector('#skip-link')!.addEventListener('click', () => skipOverlay.open('user'))

  const tier = await detectGpu(navigator as unknown as GpuNavigator, canvas)
  document.documentElement.dataset.gpu = tier
  if (tier === 'none') {
    loading.done()
    return skipOverlay.open('no-gpu')
  }

  await Game.start(canvas, tier, new GameOptions(location.search), (f, what) => loading.set(f, what))
  loading.done()
  document.documentElement.dataset.ready = '1'
}

boot().catch((err) => {
  console.error(err)
  loading.done()
  skipOverlay.open('no-gpu')
})
