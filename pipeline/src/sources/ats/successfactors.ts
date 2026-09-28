import type { CompanyRow, Ctx, JobSource } from '../../types.js';
import { SourceGoneError } from '../../types.js';
import { renderedSource } from '../rendered.js';

/**
 * SuccessFactors deployments vary by region and customer configuration. The reliable common
 * denominator is the rendered listing plus its captured JSON/XHR responses, which the rendered
 * source already extracts before falling back to detail links or an LLM.
 */
export const successFactorsSource: JobSource = {
  type: 'ats:successfactors',
  async fetchJobs(company: CompanyRow, ctx: Ctx) {
    const resolvedUrl = company.source_config?.resolved_url ?? company.career_url;
    if (!resolvedUrl) throw new SourceGoneError('successfactors: no resolved URL');
    return renderedSource.fetchJobs({ ...company, career_url: resolvedUrl, source_type: 'rendered' }, ctx);
  },
};
