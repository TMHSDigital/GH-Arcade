import { msUntilNextDaily, waitText } from '../../shared/rng';

/**
 * The daily challenge changes at midnight UTC, which is the middle of the day for many players, so
 * the hub says how long is left and, when the new day comes, calls `render` to move the "Daily"
 * chips on the cards on to it. Call it only when some game has a daily challenge.
 */
export function initDailyBanner(render: () => void): void {
  const nextDaily = document.querySelector<HTMLParagraphElement>('#next-daily')!;
  const showNextDaily = () => {
    nextDaily.textContent = `Next daily challenge in ${waitText(msUntilNextDaily())}`;
  };
  const scheduleDailyRollover = () => {
    // A moment past midnight, so the new date is certain to be in force when the cards are redrawn.
    window.setTimeout(() => {
      render();
      showNextDaily();
      scheduleDailyRollover();
    }, msUntilNextDaily() + 500);
  };
  nextDaily.hidden = false;
  showNextDaily();
  window.setInterval(showNextDaily, 60_000);
  scheduleDailyRollover();
}
