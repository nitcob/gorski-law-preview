// One place for every value that changes between the preview and the live site.
// Override any of the first three with environment variables, e.g.
//   PREVIEW=false SITE_URL=https://gorski-law.com node build.js

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);

// Full public URL of the site root, no trailing slash. Canonicals, Open Graph, the sitemap, RSS and
// llms.txt are all built from this value.
export const SITE_URL = env('SITE_URL', 'https://nitcob.github.io/gorski-law-preview').replace(/\/+$/, '');

// Path prefix every internal link and asset gets. Defaults to the path part of SITE_URL, so a GitHub
// Pages project site ("/gorski-law-preview") and a root domain ("") both work without a second edit.
export const BASE_PATH = env('BASE_PATH', new URL(SITE_URL + '/').pathname.replace(/\/+$/, ''));

// PREVIEW=true: noindex + nofollow on every page, the "concept preview" ribbon, and a contact form
// that cannot send anything. Set PREVIEW=false only for the real launch (see LAUNCH.md).
export const PREVIEW = env('PREVIEW', 'true') !== 'false';

// Production form endpoint (only used when PREVIEW=false). Empty = the form is replaced by call/email text.
export const FORM_ACTION = env('FORM_ACTION', '');

export const FIRM = {
  name: 'Gorski Law',
  attorney: 'Mark S. Gorski',
  attorneyFull: 'Mark Steven Gorski',
  nickname: 'Moose',
  founded: 1991,
  phone: '503-224-1843',
  phoneE164: '+15032241843',
  hours: [
    { days: 'Monday – Friday', short: 'Mon – Fri', time: '9:00 am – 5:00 pm' },
    { days: 'Saturday – Sunday', short: 'Sat – Sun', time: 'Closed' },
  ],
  openingHoursSpec: { dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '09:00', closes: '17:00' },
  facebook: 'https://www.facebook.com/trialmoose/',
  areaServed: 'Oregon',
  // Unknown until Mark confirms. Leave as null: the templates print a {{CONFIRM}} placeholder and the
  // address stays out of the structured data.
  address: null,
  email: null,
};

export const BUILD_DATE = env('BUILD_DATE', new Date().toISOString().slice(0, 10));
