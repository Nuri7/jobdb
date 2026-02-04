import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { jobsApi } from "@/lib/api/jobs";

interface AddCompanyModalProps {
  onCompanyAdded?: () => void;
}

export function AddCompanyModal({ onCompanyAdded }: AddCompanyModalProps) {
  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [careerUrl, setCareerUrl] = useState("");
  const [industry, setIndustry] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!companyName.trim() || !careerUrl.trim()) {
      toast({
        title: "Missing fields",
        description: "Company name and career URL are required",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    let formattedUrl = careerUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    try {
      new URL(formattedUrl);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid career page URL",
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);

    try {
      // Check if company with this career URL already exists
      const { data: existing } = await supabase
        .from('company_career_sites')
        .select('id')
        .eq('career_url', formattedUrl)
        .maybeSingle();

      if (existing) {
        toast({
          title: "Company exists",
          description: "A company with this career URL already exists",
          variant: "destructive",
        });
        setIsAdding(false);
        return;
      }

      // Insert the new company
      const { data: newCompany, error } = await supabase
        .from('company_career_sites')
        .insert({
          company_name: companyName.trim(),
          career_url: formattedUrl,
          industry: industry.trim() || null,
          is_scrape_enabled: true,
          crawl_status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Company added",
        description: `${companyName} has been added. Starting initial scrape...`,
      });

      // Clear form and close modal
      setCompanyName("");
      setCareerUrl("");
      setIndustry("");
      setOpen(false);

      // Trigger initial scrape
      if (newCompany) {
        try {
          await jobsApi.scrapeCompany(newCompany.id, formattedUrl);
          toast({
            title: "Scraping complete",
            description: `Initial scrape for ${companyName} finished`,
          });
        } catch (scrapeError) {
          console.error('Initial scrape failed:', scrapeError);
          toast({
            title: "Scrape failed",
            description: "Company was added but initial scrape failed. You can retry manually.",
            variant: "destructive",
          });
        }
      }

      onCompanyAdded?.();
    } catch (error) {
      console.error('Error adding company:', error);
      toast({
        title: "Error",
        description: "Failed to add company. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Company
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Company</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name *</Label>
            <Input
              id="companyName"
              placeholder="e.g., Acme Corp"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isAdding}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="careerUrl">Career Page URL *</Label>
            <Input
              id="careerUrl"
              placeholder="e.g., https://acme.com/careers"
              value={careerUrl}
              onChange={(e) => setCareerUrl(e.target.value)}
              disabled={isAdding}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="industry">Industry (optional)</Label>
            <Input
              id="industry"
              placeholder="e.g., Technology"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              disabled={isAdding}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isAdding}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isAdding}>
              {isAdding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add & Scrape
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
