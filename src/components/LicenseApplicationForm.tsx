import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Check, ChevronLeft, ChevronRight, Loader2, Building2, Users, DollarSign, User, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const formSchema = z.object({
  // Step 1: Company Info
  company_name: z.string().min(2, "Company name is required"),
  company_size: z.number().min(1, "Employee count is required"),
  industry: z.string().optional(),
  
  // Step 2: Executive Compensation
  current_ceo_salary: z.number().min(0).optional(),
  current_cto_salary: z.number().min(0).optional(),
  current_cfo_salary: z.number().min(0).optional(),
  current_coo_salary: z.number().min(0).optional(),
  
  // Step 3: Contact Details
  contact_name: z.string().min(2, "Contact name is required"),
  contact_email: z.string().email("Valid email is required"),
  contact_phone: z.string().optional(),
  contact_title: z.string().optional(),
  
  // Step 4: Tier Selection
  tier_requested: z.enum(["free_trial", "basic", "pro", "enterprise"]),
  
  // Step 5: Ethical Commitment
  compliance_commitment: z.boolean().refine(val => val === true, "You must agree to the ethical commitment"),
  
  // Additional
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface LicenseApplicationFormProps {
  selectedTier: string;
  onTierChange: (tier: string) => void;
}

const STEPS = [
  { id: 1, title: "Company Info", icon: Building2 },
  { id: 2, title: "Executive Compensation", icon: DollarSign },
  { id: 3, title: "Contact Details", icon: User },
  { id: 4, title: "Tier Selection", icon: Users },
  { id: 5, title: "Ethical Commitment", icon: FileCheck },
  { id: 6, title: "Review & Submit", icon: Check },
];

const INDUSTRIES = [
  "Technology", "Healthcare", "Finance", "Manufacturing", "Retail",
  "Education", "Non-Profit", "Government", "Energy", "Other"
];

const LicenseApplicationForm = ({ selectedTier, onTierChange }: LicenseApplicationFormProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      company_name: "",
      company_size: 0,
      industry: "",
      current_ceo_salary: 0,
      current_cto_salary: 0,
      current_cfo_salary: 0,
      current_coo_salary: 0,
      contact_name: "",
      contact_email: "",
      contact_phone: "",
      contact_title: "",
      tier_requested: selectedTier as any,
      compliance_commitment: false,
      notes: "",
    },
  });

  const watchedValues = form.watch();
  
  const calculateSavings = () => {
    const totalExecComp = 
      (watchedValues.current_ceo_salary || 0) +
      (watchedValues.current_cto_salary || 0) +
      (watchedValues.current_cfo_salary || 0) +
      (watchedValues.current_coo_salary || 0);
    
    // AI executives cost ~$100k/year total vs millions
    const aiCost = 100000;
    const savings = Math.max(0, totalExecComp - aiCost);
    const perEmployee = watchedValues.company_size > 0 ? savings / watchedValues.company_size : 0;
    
    return { totalExecComp, savings, perEmployee };
  };

  const { savings, perEmployee } = calculateSavings();

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("corporate_license_applications").insert({
        company_name: data.company_name,
        company_size: data.company_size,
        industry: data.industry,
        current_ceo_salary: data.current_ceo_salary,
        current_cto_salary: data.current_cto_salary,
        current_cfo_salary: data.current_cfo_salary,
        current_coo_salary: data.current_coo_salary,
        contact_name: data.contact_name,
        contact_email: data.contact_email,
        contact_phone: data.contact_phone,
        contact_title: data.contact_title,
        tier_requested: data.tier_requested,
        compliance_commitment: data.compliance_commitment,
        notes: data.notes,
        estimated_savings: savings,
        per_employee_redistribution: perEmployee,
        application_status: "submitted",
        filled_by: "self_service",
      });

      if (error) throw error;

      toast.success("Application submitted successfully!", {
        description: "We'll review your application and contact you within 48 hours.",
      });
      
      form.reset();
      setCurrentStep(1);
    } catch (error: any) {
      toast.error("Failed to submit application", {
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 6));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  return (
    <div className="space-y-8">
      {/* Progress Steps */}
      <div className="flex justify-between items-center overflow-x-auto pb-4">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;
          
          return (
            <div key={step.id} className="flex items-center">
              <div className={`flex flex-col items-center min-w-[80px] ${isActive ? 'text-primary' : isCompleted ? 'text-green-500' : 'text-muted-foreground'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${isActive ? 'border-primary bg-primary/10' : isCompleted ? 'border-green-500 bg-green-500/10' : 'border-muted'}`}>
                  {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </div>
                <span className="text-xs mt-1 text-center hidden sm:block">{step.title}</span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 mx-2 ${currentStep > step.id ? 'bg-green-500' : 'bg-muted'}`} />
              )}
            </div>
          );
        })}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Step 1: Company Info */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Company Information</h3>
              <FormField
                control={form.control}
                name="company_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Corporation" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company_size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Number of Employees *</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="500" 
                        {...field} 
                        onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      This helps us calculate per-employee redistribution amounts.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="industry"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Industry</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select industry" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INDUSTRIES.map(industry => (
                          <SelectItem key={industry} value={industry}>{industry}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* Step 2: Executive Compensation */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Current Executive Compensation</h3>
              <p className="text-sm text-muted-foreground">
                Enter your current executive salaries to calculate potential savings. 
                All amounts in USD annually.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="current_ceo_salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CEO Salary</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="5000000" 
                          {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="current_cto_salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CTO Salary</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="3000000" 
                          {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="current_cfo_salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CFO Salary</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="2500000" 
                          {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="current_coo_salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>COO Salary</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="2000000" 
                          {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {savings > 0 && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">
                    <strong>Estimated Savings:</strong> {formatCurrency(savings)}/year
                  </p>
                  <p className="text-sm text-green-600 dark:text-green-400">
                    <strong>Per Employee Raise:</strong> {formatCurrency(perEmployee)}/year
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Contact Details */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Smith" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contact_title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Title</FormLabel>
                      <FormControl>
                        <Input placeholder="VP of Operations" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contact_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane@acme.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+1 (555) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          )}

          {/* Step 4: Tier Selection */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Select License Tier</h3>
              <FormField
                control={form.control}
                name="tier_requested"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                          { value: "free_trial", label: "Free Trial", desc: "30-day pilot program", price: "$0" },
                          { value: "basic", label: "Basic", desc: "Full AI executives", price: "$100k/year" },
                          { value: "pro", label: "Pro", desc: "Advanced analytics", price: "Custom" },
                          { value: "enterprise", label: "Enterprise", desc: "Multi-division, dedicated SLA", price: "Contact us" },
                        ].map(tier => (
                          <div
                            key={tier.value}
                            onClick={() => {
                              field.onChange(tier.value);
                              onTierChange(tier.value);
                            }}
                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                              field.value === tier.value 
                                ? 'border-primary bg-primary/5' 
                                : 'border-muted hover:border-primary/50'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-semibold">{tier.label}</p>
                                <p className="text-sm text-muted-foreground">{tier.desc}</p>
                              </div>
                              <span className="text-sm font-medium text-primary">{tier.price}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* Step 5: Ethical Commitment */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Ethical Commitment</h3>
              <div className="p-4 bg-muted/50 rounded-lg space-y-3 text-sm">
                <p>By proceeding, you commit to the XMRT Ethical AI Licensing Model:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
                  <li>100% of executive compensation savings will be redistributed to employees</li>
                  <li>No layoffs will occur as a result of AI executive deployment</li>
                  <li>Quarterly compliance audits will be conducted</li>
                  <li>Public transparency reports will document your commitment</li>
                </ul>
              </div>
              <FormField
                control={form.control}
                name="compliance_commitment"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        I commit to the ethical AI redistribution mandate *
                      </FormLabel>
                      <FormDescription>
                        This is a binding commitment that will be part of your license agreement.
                      </FormDescription>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Additional Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Any additional information or questions..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* Step 6: Review & Submit */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Review Your Application</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-2">Company Details</p>
                  <p><span className="text-muted-foreground">Name:</span> {watchedValues.company_name}</p>
                  <p><span className="text-muted-foreground">Size:</span> {watchedValues.company_size} employees</p>
                  <p><span className="text-muted-foreground">Industry:</span> {watchedValues.industry || "Not specified"}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-2">Contact</p>
                  <p><span className="text-muted-foreground">Name:</span> {watchedValues.contact_name}</p>
                  <p><span className="text-muted-foreground">Email:</span> {watchedValues.contact_email}</p>
                  <p><span className="text-muted-foreground">Title:</span> {watchedValues.contact_title || "Not specified"}</p>
                </div>
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="font-medium mb-2 text-green-600 dark:text-green-400">Savings Impact</p>
                  <p><span className="text-muted-foreground">Annual Savings:</span> {formatCurrency(savings)}</p>
                  <p><span className="text-muted-foreground">Per Employee Raise:</span> {formatCurrency(perEmployee)}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="font-medium mb-2">License</p>
                  <p><span className="text-muted-foreground">Tier:</span> {watchedValues.tier_requested}</p>
                  <p><span className="text-muted-foreground">Ethical Commitment:</span> {watchedValues.compliance_commitment ? "✓ Accepted" : "Not accepted"}</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-2" /> Previous
            </Button>
            
            {currentStep < 6 ? (
              <Button type="button" onClick={nextStep}>
                Next <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    Submit Application <Check className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
};

export default LicenseApplicationForm;