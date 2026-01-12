import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink } from "lucide-react";

interface CompanyEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: {
    id: string;
    company_name: string;
    career_url: string;
    industry: string | null;
    headquarters_city: string | null;
  } | null;
  onSave: (id: string, careerUrl: string) => Promise<void>;
  isSaving: boolean;
}

const CompanyEditModal = ({
  isOpen,
  onClose,
  company,
  onSave,
  isSaving,
}: CompanyEditModalProps) => {
  const [careerUrl, setCareerUrl] = useState("");

  useEffect(() => {
    if (company) {
      setCareerUrl(company.career_url);
    }
  }, [company]);

  if (!company) return null;

  const handleSave = async () => {
    await onSave(company.id, careerUrl);
  };

  const handleOpenUrl = () => {
    window.open(careerUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Career Page URL</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Company</Label>
            <p className="font-medium">{company.company_name}</p>
          </div>

          {company.industry && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Industry</Label>
              <p className="text-sm">{company.industry}</p>
            </div>
          )}

          {company.headquarters_city && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Location</Label>
              <p className="text-sm">{company.headquarters_city}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="career-url">Career Page URL</Label>
            <div className="flex gap-2">
              <Input
                id="career-url"
                type="url"
                value={careerUrl}
                onChange={(e) => setCareerUrl(e.target.value)}
                placeholder="https://company.com/careers/jobs"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleOpenUrl}
                title="Open URL"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the direct link to the job listings page, preferably with Netherlands location filter applied.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !careerUrl}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompanyEditModal;
