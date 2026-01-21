import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface ImportCompaniesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface ParsedCompany {
  company_name: string;
  trade_name?: string;
  email?: string;
  phone_number?: string;
  address?: string;
  postal_code?: string;
  headquarters_city?: string;
  state_province?: string;
  country?: string;
  website?: string;
  company_registration_number?: string;
  ceo_name?: string;
  founding_year?: number;
  yearly_revenue_usd?: number;
  employees_on_site?: number;
  employees_total?: number;
  business_legal_type?: string;
  industry?: string;
}

type ImportStep = 'upload' | 'parsing' | 'importing' | 'complete' | 'error';

export default function ImportCompaniesModal({ isOpen, onClose, onComplete }: ImportCompaniesModalProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parsedCompanies, setParsedCompanies] = useState<ParsedCompany[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const { toast } = useToast();

  const resetState = () => {
    setStep('upload');
    setFile(null);
    setParsedCompanies([]);
    setProgress(0);
    setStatusMessage('');
    setImportedCount(0);
    setSkippedCount(0);
    setErrorMessage('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const parseExcelFile = useCallback(async (file: File): Promise<ParsedCompany[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          
          // Use the second sheet (index 1) which has the company data
          const sheetName = workbook.SheetNames[1] || workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

          const companies: ParsedCompany[] = jsonData.map((row) => ({
            company_name: String(row['Company Name'] || '').trim(),
            trade_name: row['Trade Name'] ? String(row['Trade Name']).trim() : undefined,
            email: row['Email'] ? String(row['Email']).replace(/\\/g, '').trim() : undefined,
            phone_number: row['Phone Number'] ? String(row['Phone Number']).trim() : undefined,
            address: row['Address 1'] ? String(row['Address 1']).trim() : undefined,
            postal_code: row['Postal Code'] ? String(row['Postal Code']).trim() : undefined,
            headquarters_city: row['City'] ? String(row['City']).trim() : undefined,
            state_province: row['State/Province'] ? String(row['State/Province']).trim() : undefined,
            country: row['Country'] ? String(row['Country']).trim() : 'Netherlands',
            website: row['Website'] ? String(row['Website']).trim() : undefined,
            company_registration_number: row['Company Registration Number'] ? String(row['Company Registration Number']).trim() : undefined,
            ceo_name: row['CEO Name'] ? String(row['CEO Name']).trim() : undefined,
            founding_year: row['Founding Year'] ? Number(row['Founding Year']) : undefined,
            yearly_revenue_usd: row['Yearly Revenue in U.S. Dollars'] ? Number(row['Yearly Revenue in U.S. Dollars']) : undefined,
            employees_on_site: row['Employees On Site'] ? Number(row['Employees On Site']) : undefined,
            employees_total: row['Employees Total'] ? Number(row['Employees Total']) : undefined,
            business_legal_type: row['Business Legal Type - Description'] ? String(row['Business Legal Type - Description']).trim() : undefined,
            industry: mapBusinessCategoryToIndustry(row['Business Category Code 1'] as string),
          })).filter(c => c.company_name);

          resolve(companies);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });
  }, []);

  const mapBusinessCategoryToIndustry = (code: string | undefined): string => {
    if (!code) return 'Other';
    const codeNum = parseInt(code);
    
    // SIC code ranges to industry mapping
    if (codeNum >= 6000 && codeNum < 6800) return 'Fintech';
    if (codeNum >= 7370 && codeNum < 7400) return 'Technology';
    if (codeNum >= 8000 && codeNum < 8100) return 'Healthcare';
    if (codeNum >= 5200 && codeNum < 5600) return 'E-commerce';
    if (codeNum >= 4500 && codeNum < 4800) return 'Travel';
    if (codeNum >= 5800 && codeNum < 5900) return 'Food & Beverage';
    if (codeNum >= 4900 && codeNum < 5000) return 'Energy';
    if (codeNum >= 4000 && codeNum < 4500) return 'Logistics';
    return 'Other';
  };

  const importCompanies = async () => {
    if (!file) return;

    try {
      // Step 1: Parse Excel
      setStep('parsing');
      setStatusMessage('Parsing Excel file...');
      setProgress(0);

      const companies = await parseExcelFile(file);
      setParsedCompanies(companies);
      
      if (companies.length === 0) {
        throw new Error('No companies found in the file');
      }

      setStatusMessage(`Found ${companies.length} companies`);
      setProgress(100);

      // Step 2: Import to database (skip career page finding)
      setStep('importing');
      setProgress(0);

      // Get existing company names to avoid duplicates
      const { data: existingCompanies } = await supabase
        .from('company_career_sites')
        .select('company_name');
      
      const existingNames = new Set(
        existingCompanies?.map(c => c.company_name.toLowerCase()) || []
      );

      let imported = 0;
      let skipped = 0;

      for (let i = 0; i < companies.length; i++) {
        const company = companies[i];
        setProgress(Math.round((i / companies.length) * 100));
        setStatusMessage(`Importing companies... (${i + 1}/${companies.length})`);

        // Skip if company already exists
        if (existingNames.has(company.company_name.toLowerCase())) {
          skipped++;
          continue;
        }

        // Use website as placeholder career URL, or empty placeholder
        const careerUrl = company.website || 'pending';

        try {
          const { error } = await supabase.from('company_career_sites').insert({
            company_name: company.company_name,
            career_url: careerUrl,
            trade_name: company.trade_name,
            email: company.email,
            phone_number: company.phone_number,
            address: company.address,
            postal_code: company.postal_code,
            headquarters_city: company.headquarters_city,
            state_province: company.state_province,
            country: company.country,
            website: company.website,
            company_registration_number: company.company_registration_number,
            ceo_name: company.ceo_name,
            founding_year: company.founding_year,
            yearly_revenue_usd: company.yearly_revenue_usd,
            employees_on_site: company.employees_on_site,
            employees_total: company.employees_total,
            business_legal_type: company.business_legal_type,
            industry: company.industry,
            is_active: true,
            is_scrape_enabled: false,
          });

          if (error) {
            console.error('Error inserting company:', error);
            skipped++;
          } else {
            imported++;
          }
        } catch (error) {
          console.error('Error inserting company:', error);
          skipped++;
        }
      }

      setImportedCount(imported);
      setSkippedCount(skipped);
      setStep('complete');
      setProgress(100);

    } catch (error) {
      console.error('Import error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Import failed');
      setStep('error');
    }
  };

  const handleComplete = () => {
    toast({
      title: "Import complete",
      description: `Imported ${importedCount} companies (${skippedCount} skipped)`,
    });
    onComplete();
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import Companies
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file with company data. Use "Find Career Pages" button after import to discover career URLs.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <div 
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer"
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-2">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  Excel files (.xlsx, .xls)
                </p>
                <input
                  id="file-input"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
              
              {file && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <FileSpreadsheet className="w-5 h-5 text-green-500" />
                  <span className="text-sm truncate flex-1">{file.name}</span>
                </div>
              )}
            </div>
          )}

          {(step === 'parsing' || step === 'importing') && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm">{statusMessage}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {step === 'complete' && (
            <div className="space-y-4 text-center">
              <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
              <div>
                <p className="font-medium">Import Complete!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Successfully imported {importedCount} companies
                </p>
                {skippedCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {skippedCount} companies were skipped (duplicates or missing URLs)
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-4 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
              <div>
                <p className="font-medium text-destructive">Import Failed</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {errorMessage}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={importCompanies} disabled={!file}>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
            </>
          )}

          {(step === 'parsing' || step === 'importing') && (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}

          {step === 'complete' && (
            <Button onClick={handleComplete}>
              Done
            </Button>
          )}

          {step === 'error' && (
            <>
              <Button variant="outline" onClick={resetState}>
                Try Again
              </Button>
              <Button onClick={handleClose}>
                Close
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
