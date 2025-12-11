import { Check, Zap, Crown, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface LicenseTierCardsProps {
  onSelectTier: (tier: string) => void;
  selectedTier: string;
}

const tiers = [
  {
    id: "free_trial",
    name: "Free Trial",
    price: "$0",
    period: "30 days",
    description: "Test our AI executives risk-free",
    icon: Zap,
    features: [
      "Access to all 4 AI executives",
      "Limited to 100 decisions/month",
      "Basic analytics dashboard",
      "Community support",
      "No credit card required",
    ],
    highlight: false,
    badge: null,
  },
  {
    id: "basic",
    name: "Basic",
    price: "$100k",
    period: "per year",
    description: "Full AI executive deployment",
    icon: Check,
    features: [
      "Unlimited AI executive decisions",
      "Full analytics & reporting",
      "Email support",
      "Quarterly compliance audits",
      "Employee redistribution tracking",
      "Integration with existing systems",
    ],
    highlight: false,
    badge: null,
  },
  {
    id: "pro",
    name: "Pro",
    price: "Custom",
    period: "contact sales",
    description: "Advanced features for scaling companies",
    icon: Crown,
    features: [
      "Everything in Basic",
      "Dedicated success manager",
      "Custom AI training on company data",
      "Advanced scenario modeling",
      "Priority 24/7 support",
      "Multi-department deployment",
      "Board-level reporting",
    ],
    highlight: true,
    badge: "Most Popular",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Contact",
    period: "for pricing",
    description: "For large organizations",
    icon: Building,
    features: [
      "Everything in Pro",
      "Multi-division deployment",
      "Dedicated infrastructure",
      "Custom SLA guarantees",
      "On-premise option available",
      "Executive briefings",
      "Custom integrations",
      "Unlimited users",
    ],
    highlight: false,
    badge: null,
  },
];

const LicenseTierCards = ({ onSelectTier, selectedTier }: LicenseTierCardsProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {tiers.map((tier) => {
        const Icon = tier.icon;
        const isSelected = selectedTier === tier.id;
        
        return (
          <Card 
            key={tier.id}
            className={`relative transition-all ${
              tier.highlight 
                ? 'border-primary shadow-lg shadow-primary/10 scale-105' 
                : isSelected 
                  ? 'border-primary' 
                  : 'border-muted'
            }`}
          >
            {tier.badge && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                {tier.badge}
              </Badge>
            )}
            
            <CardHeader className="text-center pb-2">
              <div className={`w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center ${
                tier.highlight ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                <Icon className="w-6 h-6" />
              </div>
              <CardTitle className="text-xl">{tier.name}</CardTitle>
              <CardDescription>{tier.description}</CardDescription>
            </CardHeader>
            
            <CardContent className="text-center">
              <div className="mb-6">
                <span className="text-3xl font-bold">{tier.price}</span>
                <span className="text-muted-foreground text-sm ml-1">/{tier.period}</span>
              </div>
              
              <ul className="space-y-2 text-sm text-left">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            
            <CardFooter>
              <Button 
                className="w-full" 
                variant={tier.highlight ? "default" : isSelected ? "default" : "outline"}
                onClick={() => onSelectTier(tier.id)}
              >
                {isSelected ? "Selected" : tier.id === "enterprise" ? "Contact Sales" : "Select"}
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
};

export default LicenseTierCards;