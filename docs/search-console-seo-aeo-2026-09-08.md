# Roogo search appearance, SEO and AEO

Audit performed September 8, 2026 in Google Search Console, using the Roogo Chrome profile and the `roogobf.com` domain property. Code changes are prepared in `feat/search-appearance`; they have not been deployed.

## What the data says

The Web performance report covers June 7–September 6, 2026. It reports 209 clicks, approximately 6.89K impressions, 3% CTR and average position 6.5. Position and CTR are averages across queries, countries and devices, not a fixed ranking for everyone. The query table lists 212 query rows; its rows do not account for every click because Search Console omits some query data. CSV export was blocked by Chrome, so the figures below were read from the report UI.

| Page | Clicks | Impressions | CTR | Average position |
| --- | ---: | ---: | ---: | ---: |
| Homepage | 143 | 4,034 | 3.5% | 6.1 |
| /proprietes | 43 | 1,704 | 2.5% | 7.0 |
| Maison, 2 chambres, Ouaga 2000 Trame d'accueil | 6 | 436 | 1.4% | 6.1 |
| Villa, 2 chambres, Patte d'oie | 5 | 74 | 6.8% | 5.5 |
| Villa, 3 chambres, Cité Azimo Ouaga 2000 | 2 | 383 | 0.5% | 8.3 |
| /nous-contacter | 1 | 59 | 1.7% | 5.6 |
| /visites-3d | 1 | 31 | 3.2% | 5.4 |

The homepage and listings hub contribute 186 of 209 clicks (89%). Mobile contributes 164 clicks (78%) and 5,202 impressions; desktop contributes 42 clicks and 1,596 impressions; tablet contributes 3 clicks and 95 impressions. Burkina Faso contributes 138 clicks and 4,829 impressions. France and Canada contribute 13 and 9 clicks respectively.

| Query | Clicks | Impressions | CTR | Average position |
| --- | ---: | ---: | ---: | ---: |
| roogo | 16 | 88 | 18.2% | 4.9 |
| location maison ouagadougou | 6 | 82 | 7.3% | 7.6 |
| location | 3 | 1,292 | 0.2% | 6.8 |
| maison à louer à ouaga annonces recente 2026 | 3 | 104 | 2.9% | 3.8 |
| location ouagadougou | 3 | 77 | 3.9% | 8.8 |
| location de maison à ouagadougou | 3 | 21 | 14.3% | 4.5 |
| trame d'accueil ouaga 2000 | 1 | 161 | 0.6% | 5.1 |
| maison à louer à ouagadougou | 1 | 84 | 1.2% | 6.5 |
| cite azimo ouaga 2000 | 0 | 106 | 0% | 8.3 |
| cité azimo ouaga 2000 | 0 | 90 | 0% | 8.6 |
| trame d'accueil | 0 | 67 | 0% | 7.3 |

These results support keeping rental intent and Ouagadougou prominent. The broad word “location” has ambiguous intent; its low CTR is not by itself a defect. The neighborhood queries justify clearer listing titles and useful neighborhood search guidance. The new FAQ questions are editorial responses to these topics, not claimed verbatim Search Console queries.

## AI visibility already exists

The account exposes a **Generative AI features (Beta)** report. With its 3-month range selected, it reports approximately 1.12K impressions across 23 pages:

| Page | AI-feature impressions |
| --- | ---: |
| Homepage | 825 |
| /proprietes | 234 |
| Villa, 3 chambres, Cité Azimo Ouaga 2000 | 19 |
| Villa, 2 chambres, Patte d'oie | 10 |
| Maison, 2 chambres, Trame d'accueil | 9 |
| /nous-contacter | 7 |
| /visites-3d | 5 |
| /a-propos | 4 |

This is Google AI-feature visibility. The report displayed impressions, not conversions or ChatGPT/Perplexity referrals. It does not establish why Google selected a page, and these impressions should not be added to Web impressions as if they were necessarily separate audiences.

## The homepage crawl explains a technical concern

Google's saved September 4 crawl reports successful fetch, indexing allowed, and the homepage indexed. However, it reports **User-declared canonical: None**. The crawled HTML editor shows an empty `<title></title>` and no ordinary title/description/canonical elements carrying the intended values; those values appear inside the Next.js streamed JavaScript payload. The page body in this saved rendering contains scripts rather than the homepage's visible sections. This is evidence of an incomplete rendered snapshot, not proof of its exact cause.

The live test run on September 8 at 10:39 AM says **URL is available to Google**. Its rendered HTML contains the correct existing title, description and canonical. The live site is healthier than the stored snapshot. A recrawl after deployment is necessary to see whether Google adopts the updated result; no metadata change can guarantee a snippet or sitelinks.

The implementation uses Next.js `htmlLimitedBots: /.*/` to deliver metadata in the initial document head for all user agents. It changes rendering delivery, not the content shown to crawlers versus people. The tradeoff is that the initial response waits for metadata resolution, including on dynamic listing pages. It cannot by itself guarantee that every client component renders in Google's browser.

## Indexing findings

The Page indexing report was last updated September 3: 39 indexed, 11 excluded across five reasons.

- **3 discovered, currently not indexed:** privacy policy; the terrain listing in Bobo-Dioulasso near the flour factory; the 5-bedroom villa in Dassasgho. The two property pages merit individual live inspection and indexing requests if still public and available.
- **2 crawled, currently not indexed:** JavaScript chunk URLs, not public property pages. Do not block the JavaScript resources Google needs to render the site.
- **1 not found:** an old `_next/static/media/...woff2` font URL, not a business page. Do not redirect missing assets to the homepage.
- **3 redirects and 2 robots exclusions:** counts observed; individual URLs were not inspected in this audit.
- **1 indexed-without-content warning:** `https://clerk.roogobf.com/`, last crawled June 12. This is the authentication subdomain, not the public homepage. Its configuration is outside this repository's public-page changes.

The submitted sitemap is healthy: **Success**, last read September 7, **41 discovered pages**. The older homepage inspection's “Temporary processing error” is not evidence of a current broken sitemap. Breadcrumbs show 26 valid and 0 invalid items. Core Web Vitals has insufficient data; this is not a passing performance score.

## Changes prepared

- Homepage title: **Roogo : maisons et appartements à louer à Ouagadougou**. Description retains Burkina Faso and explains the next action.
- Consistent search and sharing metadata, with self-canonicals on About, Contact, Careers and the HTML site map.
- Existing `WebSite` schema retained, with **Roogo Burkina** as an alternate site name. Existing SearchAction is retained; it does not create Google sitelinks.
- Listing titles and structured-data names now include bedrooms, rental/sale intent, neighborhood and city. Example: **Villa 3 chambres à louer à Cité Azimo Ouaga 2000, Ouagadougou**. Existing property URLs remain stable.
- Five visible FAQs answer rental search, neighborhood search, what to compare before a visit, remote tours and publishing. Each links to an existing useful destination. FAQ structured data uses the exact same question/answer source. This is useful content, not a promise of a Google FAQ rich result.
- Removed implementation-facing copy from the homepage's popular searches section.
- Expanded the HTML site map to include Blog, Tutorials and Careers, and added it to the XML sitemap. Verification found that `/plan-du-site` was accidentally behind authentication; its exact route is now public. No account or admin routes are opened.
- Corrected the footer's misleading publishing link to the existing selling tutorial with the label “Mettre un bien en vente”.
- Removed invented current timestamps from static sitemap entries whose actual modification dates are unknown. Known blog dates are retained.

## Release and follow-up

1. Deploy the reviewed branch through the normal production workflow.
2. In Search Console, live-test the homepage, `/proprietes`, and key sitelink candidates. Confirm initial HTML contains a nonempty title, description, canonical and visible page content.
3. Request indexing of the homepage and changed priority pages, then the two still-available discovered property pages. The existing sitemap submission remains valid.
4. Compare equal periods after recrawling, tracking the rental and neighborhood query groups separately from brand searches. Watch mobile CTR and homepage/listing impressions. Treat early low-volume fluctuations cautiously.
5. Continue improving useful listing details and real tutorials. Only add neighborhood pages when there is enough distinct inventory and factual local content to help visitors; do not create thin keyword pages.

Google chooses sitelinks automatically. The desired candidates are Properties, 3D visits, Blog, About, and Contact, but their appearance and order cannot be set in code.

## Sources

- [Roogo Web performance](https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Aroogobf.com)
- [Roogo generative AI performance](https://search.google.com/search-console/performance/search-analytics/ai?resource_id=sc-domain%3Aroogobf.com)
- [Roogo indexing](https://search.google.com/search-console/index?resource_id=sc-domain%3Aroogobf.com)
- [Roogo sitemaps](https://search.google.com/search-console/sitemaps?resource_id=sc-domain%3Aroogobf.com)
- [Google sitelinks guidance](https://developers.google.com/search/docs/appearance/sitelinks)
- [Google site-name guidance](https://developers.google.com/search/docs/appearance/site-names)
- [Google AI-feature content guidance](https://developers.google.com/search/docs/appearance/ai-features) — the generic measurement section does not reflect the dedicated beta report visible in this account; the account UI is the evidence used above.
- [Next.js blocking metadata configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots)
- [Google recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)

## Validation completed

- Production build passed, including the repository motion audit, lint and TypeScript checks.
- Eighteen production-server HTTP checks passed: six changed routes tested with ordinary browser, Googlebot smartphone and ChatGPT-User user agents. Each returned 200 with a nonempty title, description and canonical in the document head, plus a server-rendered H1.
- Homepage checks verified all five visible FAQ answers match the FAQ JSON-LD and the important sitelink candidates have crawlable links.
- A live-inventory property rendered its bedroom count and rental intent in the title.
- `/plan-du-site` returns 200 for anonymous requests; `/admin` remains protected (anonymous request returns 404).
- XML sitemap includes the HTML site map and no longer claims the homepage changes on every sitemap rebuild.
- `git diff --check` passed. No deployment or indexing request has been made.
