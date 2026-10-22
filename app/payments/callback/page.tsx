// The old payment return address serves the same page directly, with no
// redirect: payments started before the French addresses (2026-10-11) come
// back here, and the return must stay as fast as possible (Salif). New payments
// return to /paiements/retour.
export { default } from "../../paiements/retour/page";
