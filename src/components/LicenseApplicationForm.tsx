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
  company_name: z.string().min(2, "Company name is required"),
  company_size: z.number().min(1, "Employee count is required"),
  industry: z.string().optional(),
  current_ceo_salary: z.number().min(0).optional(),
  current_cto_salary: z.number().min(0).optional(),
  current_cfo_salary: z.number().min(0).optional(),
  current_coo_salary: z.number().min(0).optional(),
  contact_name: z.string().min(2, "Contact name is required"),
  contact_email: z.string().email("Valid email is required"),
  contact_phone: z.string().optional(),
  contact_title: z.string().optional(),
  tier_requested: z.enum(["free_trial", "basic", "pro", "enterprise"]),
  compliance_commitment: z.boolean().refine(val => val === true, "You must agree to the ethical commitment"),
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

// Currency formatting helpers
const formatCurrencyDisplay = (value: number | undefined): string => {
  if (!value || value === 0) return "";
  return new Intl.NumberFormat('en-US').format(value);
};

const parseCurrencyInput = (value: string): number => {
  const cleaned = value.replace(/[^0-9]/g, '');
  return parseInt(cleaned) || 0;
};

const formatCurrencyFull = (value: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};

// Currency input component
const CurrencyInput = ({ 
  value, 
  onChange, 
  placeholder 
}: { 
  value: number | undefined; 
  onChange: (val: number) => void; 
  placeholder: string;
}) => {
  const [displayValue, setDisplayValue] = useState(formatCurrencyDisplay(value));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const parsed = parseCurrencyInput(raw);
    setDisplayValue(formatCurrencyDisplay(parsed));
    onChange(parsed);
  };

  const handleFocus = () => {
    if (value === 0) setDisplayValue("");
  };

  const handleBlur = () => {
    setDisplayValue(formatCurrencyDisplay(value));
  };

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
      <Input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="pl-7"
      />
    </div>
  );
};

const LicenseApplicationForm = ({ selectedTier, onTierChange }: LicenseApplicationFormProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedAppId, setSubmittedAppId] = useState<string | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      company_name: "",
      company_size: undefined as unknown as number,
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
    
    const aiCost = 100000;
    const savings = Math.max(0, totalExecComp - aiCost);
    const perEmployee = watchedValues.company_size > 0 ? savings / watchedValues.company_size : 0;
    
    return { totalExecComp, savings, perEmployee };
  };

  const { savings, perEmployee } = calculateSavings();

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    try {
      // Submit via edge function for monetization integration
      const { data: result, error } = await supabase.functions.invoke('process-license-application', {
        body: {
          action: 'submit_application',
          data: {
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
            filled_by: 'self_service_form',
          }
        }
      });

      if (error) throw error;

      setSubmittedAppId(result?.application_id);
      
      toast.success("Application submitted successfully!", {
        description: `Estimated savings: ${formatCurrencyFull(result?.estimated_savings || savings)}/year. We'll contact you within 48 hours.`,
      });
      
      // Move to success state instead of resetting
      setCurrentStep(7);
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

  // Success state
  if (currentStep === 7) {
    return (
      <div className="text-center py-12 space-y-6">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
          <Check className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-2xl font-bold">Application Submitted!</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your application ID is <code className="bg-muted px-2 py-1 rounded">{submittedAppId}</code>
        </p>
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg max-w-md mx-auto">
          <p className="text-green-600 dark:text-green-400 font-medium">
            Estimated Annual Savings: {formatCurrencyFull(savings)}
          </p>
          <p className="text-green-600 dark:text-green-400">
            Per Employee Raise: {formatCurrencyFull(perEmployee)}/year
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Our team will review your application and contact you within 48 hours.
        </p>
        <Button onClick={() => { form.reset(); setCurrentStep(1); setSubmittedAppId(null); }}>
          Submit Another Application
        </Button>
      </div>
    );
  }

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
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g., 500"
                        value={field.value || ""}
                        onChange={e => {
                          const val = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0;
                          field.onChange(val);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      This helps us calculate per-employee redistribution amounts.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {/* Quick presets */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground mr-2">Quick select:</span>
                {[50, 200, 500, 1000, 5000].map(count => (
                  <Button
                    key={count}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => form.setValue('company_size', count)}
                    className="text-xs"
                  >
                    {count.toLocaleString()}
                  </Button>
                ))}
              </div>
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
              {/* Quick presets for salaries */}
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs text-muted-foreground mr-2">Load example:</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    form.setValue('current_ceo_salary', 5000000);
                    form.setValue('current_cto_salary', 3000000);
                    form.setValue('current_cfo_salary', 2500000);
                    form.setValue('current_coo_salary', 2000000);
                  }}
                  className="text-xs"
                >
                  Fortune 500
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    form.setValue('current_ceo_salary', 500000);
                    form.setValue('current_cto_salary', 400000);
                    form.setValue('current_cfo_salary', 350000);
                    form.setValue('current_coo_salary', 300000);
                  }}
                  className="text-xs"
                >
                  Mid-Market
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    form.setValue('current_ceo_salary', 200000);
                    form.setValue('current_cto_salary', 180000);
                    form.setValue('current_cfo_salary', 150000);
                    form.setValue('current_coo_salary', 140000);
                  }}
                  className="text-xs"
                >
                  Startup
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="current_ceo_salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CEO Salary</FormLabel>
                      <FormControl>
                        <CurrencyInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="5,000,000"
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
                        <CurrencyInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="3,000,000"
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
                        <CurrencyInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="2,500,000"
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
                        <CurrencyInput
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="2,000,000"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {savings > 0 && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg animate-pulse">
                  <p className="text-lg text-green-600 dark:text-green-400">
                    <strong>Estimated Savings:</strong> {formatCurrencyFull(savings)}/year
                  </p>
                  <p className="text-lg text-green-600 dark:text-green-400">
                    <strong>Per Employee Raise:</strong> {formatCurrencyFull(perEmployee)}/year
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
              <div className="p-4 bg-muted rounded-lg space-y-3 text-sm">
                <p><strong>By applying for Suite's AI Executive License, you commit to:</strong></p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Redistribute at least 50% of executive salary savings to employee raises</li>
                  <li>Maintain transparent reporting on redistribution amounts</li>
                  <li>Not use AI executives to justify workforce reductions</li>
                  <li>Partner with Suite in promoting ethical AI adoption</li>
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
                        I commit to Suite's ethical AI principles *
                      </FormLabel>
                      <FormDescription>
                        This commitment is binding and will be part of your license agreement.
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Company</p>
                  <p className="font-medium">{watchedValues.company_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Employees</p>
                  <p className="font-medium">{(watchedValues.company_size || 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Contact</p>
                  <p className="font-medium">{watchedValues.contact_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tier</p>
                  <p className="font-medium capitalize">{watchedValues.tier_requested?.replace('_', ' ')}</p>
                </div>
              </div>
              
              {savings > 0 && (
                <div className="p-6 bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-lg">
                  <h4 className="font-semibold text-lg mb-4">Your Potential Impact</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {formatCurrencyFull(savings)}
                      </p>
                      <p className="text-sm text-muted-foreground">Annual Savings</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {formatCurrencyFull(perEmployee)}
                      </p>
                      <p className="text-sm text-muted-foreground">Per Employee Raise</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            
            {currentStep < 6 ? (
              <Button type="button" onClick={nextStep}>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Application"
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