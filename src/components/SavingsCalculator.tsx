import { useState } from "react";
import { Calculator, DollarSign, Users, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

// Currency formatting helpers
const formatCurrencyDisplay = (value: number): string => {
  if (value === 0) return "";
  return new Intl.NumberFormat('en-US').format(value);
};

const parseCurrencyInput = (value: string): number => {
  const cleaned = value.replace(/[^0-9]/g, '');
  return parseInt(cleaned) || 0;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD', 
    maximumFractionDigits: 0 
  }).format(value);
};

// Currency input component
const CurrencyInput = ({ 
  value, 
  onChange, 
  placeholder,
  label
}: { 
  value: number; 
  onChange: (val: number) => void; 
  placeholder: string;
  label: string;
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
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
        <Input
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="pl-6"
        />
      </div>
    </div>
  );
};

const SavingsCalculator = () => {
  const [employeeCount, setEmployeeCount] = useState(500);
  const [ceoSalary, setCeoSalary] = useState(5000000);
  const [ctoSalary, setCtoSalary] = useState(3000000);
  const [cfoSalary, setCfoSalary] = useState(2500000);
  const [cooSalary, setCooSalary] = useState(2000000);

  const totalExecComp = ceoSalary + ctoSalary + cfoSalary + cooSalary;
  const aiCost = 100000;
  const annualSavings = Math.max(0, totalExecComp - aiCost);
  const perEmployeeRaise = employeeCount > 0 ? annualSavings / employeeCount : 0;
  const percentageIncrease = employeeCount > 0 && totalExecComp > 0 
    ? (perEmployeeRaise / 60000) * 100
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="w-5 h-5" />
          Savings Calculator
        </CardTitle>
        <CardDescription>
          See how much you could save and redistribute to employees
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Employee Count */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Number of Employees
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[employeeCount]}
                onValueChange={(value) => setEmployeeCount(value[0])}
                min={10}
                max={10000}
                step={10}
                className="flex-1"
              />
              <Input
                type="text"
                inputMode="numeric"
                value={employeeCount || ""}
                onChange={(e) => setEmployeeCount(parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                className="w-24"
                placeholder="500"
              />
            </div>
            {/* Quick presets */}
            <div className="flex flex-wrap gap-1">
              {[100, 500, 1000, 5000].map(count => (
                <Button
                  key={count}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEmployeeCount(count)}
                  className="text-xs h-6 px-2"
                >
                  {count.toLocaleString()}
                </Button>
              ))}
            </div>
          </div>

          {/* Executive Salaries */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Executive Compensation
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <CurrencyInput
                label="CEO"
                value={ceoSalary}
                onChange={setCeoSalary}
                placeholder="5,000,000"
              />
              <CurrencyInput
                label="CTO"
                value={ctoSalary}
                onChange={setCtoSalary}
                placeholder="3,000,000"
              />
              <CurrencyInput
                label="CFO"
                value={cfoSalary}
                onChange={setCfoSalary}
                placeholder="2,500,000"
              />
              <CurrencyInput
                label="COO"
                value={cooSalary}
                onChange={setCooSalary}
                placeholder="2,000,000"
              />
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t">
          <div className="text-center p-4 bg-green-500/10 rounded-lg">
            <TrendingUp className="w-6 h-6 mx-auto mb-2 text-green-500" />
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(annualSavings)}
            </p>
            <p className="text-sm text-muted-foreground">Annual Savings</p>
          </div>
          
          <div className="text-center p-4 bg-blue-500/10 rounded-lg">
            <DollarSign className="w-6 h-6 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(perEmployeeRaise)}
            </p>
            <p className="text-sm text-muted-foreground">Per Employee Raise/Year</p>
          </div>
          
          <div className="text-center p-4 bg-purple-500/10 rounded-lg">
            <Users className="w-6 h-6 mx-auto mb-2 text-purple-500" />
            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {percentageIncrease.toFixed(0)}%
            </p>
            <p className="text-sm text-muted-foreground">Salary Increase*</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          *Based on average salary of $60,000. AI executive cost is ~$100k/year total.
        </p>
      </CardContent>
    </Card>
  );
};

export default SavingsCalculator;