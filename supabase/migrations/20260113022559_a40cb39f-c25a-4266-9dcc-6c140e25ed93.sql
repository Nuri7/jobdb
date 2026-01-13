-- Add extraction_prompt setting to scraper_settings
INSERT INTO public.scraper_settings (setting_key, setting_value, description)
VALUES (
  'extraction_prompt',
  '"Extract job details from this career page content. Look for:\n\n1. **Job Title**: The main position title, clean of company names and special characters\n2. **Location**: City name (especially Dutch cities like Amsterdam, Rotterdam, Utrecht, Nijmegen, etc.). Check the URL path for city names if not in content.\n3. **Employment Type**: Full-time, Part-time, or Contract\n4. **Remote/Hybrid**: Is remote or hybrid work mentioned?\n5. **Department**: Team or department name if mentioned\n6. **Experience Level**: Junior, Medior, Senior, Principal, or years of experience\n7. **Salary Range**: Any salary or compensation information (look for € amounts)\n8. **Internship**: Is this an internship, traineeship, or student position?\n\nReturn structured data with these fields. For location, prioritize Dutch city names found in content or URL."',
  'Prompt used to guide job data extraction from scraped content'
)
ON CONFLICT (setting_key) DO UPDATE SET 
  setting_value = EXCLUDED.setting_value,
  description = EXCLUDED.description;