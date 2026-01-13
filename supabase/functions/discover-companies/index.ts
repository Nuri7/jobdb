import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sample Dutch companies to discover (career page URLs)
const DUTCH_COMPANY_SOURCES = [
  { name: 'Booking.com', url: 'https://careers.booking.com/jobs', industry: 'Travel' },
  { name: 'Philips', url: 'https://www.careers.philips.com/global/en/search-results', industry: 'Healthcare Technology' },
  { name: 'ASML', url: 'https://www.asml.com/en/careers/find-your-job', industry: 'Semiconductor' },
  { name: 'Shell', url: 'https://www.shell.com/careers/browse-opportunities', industry: 'Energy' },
  { name: 'Heineken', url: 'https://careers.heineken.com/global/en/search-results', industry: 'Beverages' },
  { name: 'KLM', url: 'https://careers.klm.com/en/vacancies', industry: 'Aviation' },
  { name: 'Rabobank', url: 'https://www.rabobank.jobs/en/vacancies/', industry: 'Banking' },
  { name: 'TomTom', url: 'https://www.tomtom.com/careers/jobs/', industry: 'Navigation Technology' },
  { name: 'Just Eat Takeaway', url: 'https://careers.justeattakeaway.com/global/en/search-results', industry: 'Food Delivery' },
  { name: 'Picnic', url: 'https://picnic.app/careers/all-jobs', industry: 'E-commerce' },
  { name: 'Coolblue', url: 'https://www.careersatcoolblue.com/vacancies', industry: 'E-commerce' },
  { name: 'Elastic', url: 'https://www.elastic.co/careers', industry: 'Software' },
  { name: 'GitLab', url: 'https://about.gitlab.com/jobs/all-jobs/', industry: 'Software' },
  { name: 'MessageBird', url: 'https://messagebird.com/careers', industry: 'Communications' },
  { name: 'Mollie', url: 'https://jobs.mollie.com/', industry: 'Fintech' },
  { name: 'Bunq', url: 'https://www.bunq.com/careers', industry: 'Banking' },
  { name: 'WeTransfer', url: 'https://wetransfer.com/careers', industry: 'File Sharing' },
  { name: 'Miro', url: 'https://miro.com/careers/', industry: 'Collaboration Software' },
  { name: 'Remote', url: 'https://remote.com/careers', industry: 'HR Tech' },
  { name: 'Catawiki', url: 'https://www.catawiki.com/en/jobs', industry: 'E-commerce' },
  { name: 'Bol.com', url: 'https://careers.bol.com/en/all-vacancies/', industry: 'E-commerce' },
  { name: 'NXP Semiconductors', url: 'https://www.nxp.com/company/about-nxp/careers', industry: 'Semiconductor' },
  { name: 'Randstad', url: 'https://www.randstad.com/careers/', industry: 'Staffing' },
  { name: 'Wolters Kluwer', url: 'https://www.wolterskluwer.com/en/careers', industry: 'Information Services' },
  { name: 'Prosus', url: 'https://www.prosus.com/careers', industry: 'Investment' },
  { name: 'Ahold Delhaize', url: 'https://careers.aholddelhaize.com/', industry: 'Retail' },
  { name: 'NN Group', url: 'https://www.nn-group.com/careers.htm', industry: 'Insurance' },
  { name: 'Aegon', url: 'https://www.aegon.com/careers/', industry: 'Insurance' },
  { name: 'DSM', url: 'https://www.dsm.com/corporate/careers.html', industry: 'Life Sciences' },
  { name: 'Signify', url: 'https://www.signify.com/global/careers', industry: 'Lighting' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { count = 10 } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get existing company names to avoid duplicates
    const { data: existingCompanies } = await supabase
      .from('company_career_sites')
      .select('company_name');
    
    const existingNames = new Set(
      existingCompanies?.map(c => c.company_name.toLowerCase()) || []
    );

    // Filter out companies that already exist
    const availableCompanies = DUTCH_COMPANY_SOURCES.filter(
      c => !existingNames.has(c.name.toLowerCase())
    );

    if (availableCompanies.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          companiesAdded: 0, 
          message: 'All predefined companies already exist in the database' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Shuffle and pick random companies
    const shuffled = availableCompanies.sort(() => Math.random() - 0.5);
    const toAdd = shuffled.slice(0, Math.min(count, shuffled.length));

    // Insert the companies
    const { data: inserted, error } = await supabase
      .from('company_career_sites')
      .insert(
        toAdd.map(c => ({
          company_name: c.name,
          career_url: c.url,
          industry: c.industry,
          is_active: true,
        }))
      )
      .select();

    if (error) {
      throw error;
    }

    console.log(`Added ${inserted?.length || 0} companies:`, toAdd.map(c => c.name));

    return new Response(
      JSON.stringify({ 
        success: true, 
        companiesAdded: inserted?.length || 0,
        companies: toAdd.map(c => c.name)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error discovering companies:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
