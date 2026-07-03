import { apiSource } from './api.js';
import { ashbySource } from './ats/ashby.js';
import { greenhouseSource } from './ats/greenhouse.js';
import { homerunSource, joinSource, teamtailorSource } from './ats/listing-based.js';
import { leverSource } from './ats/lever.js';
import { personioSource } from './ats/personio.js';
import { recruiteeSource } from './ats/recruitee.js';
import { smartrecruitersSource } from './ats/smartrecruiters.js';
import { workableSource } from './ats/workable.js';
import { renderedSource } from './rendered.js';
import { sitemapSource } from './sitemap.js';
import { staticHtmlSource } from './static-html.js';
import type { JobSource, SourceType } from '../types.js';

const sources: Record<SourceType, JobSource> = {
  'ats:recruitee': recruiteeSource,
  'ats:greenhouse': greenhouseSource,
  'ats:lever': leverSource,
  'ats:ashby': ashbySource,
  'ats:workable': workableSource,
  'ats:smartrecruiters': smartrecruitersSource,
  'ats:personio': personioSource,
  'ats:teamtailor': teamtailorSource,
  'ats:homerun': homerunSource,
  'ats:join': joinSource,
  api: apiSource,
  sitemap: sitemapSource,
  static: staticHtmlSource,
  rendered: renderedSource,
};

export function sourceFor(type: SourceType): JobSource {
  const source = sources[type];
  if (!source) throw new Error(`Unknown source type: ${type}`);
  return source;
}
