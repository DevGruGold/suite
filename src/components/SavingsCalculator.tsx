import { useState } from "react";
import { Calculator, DollarSign, Users, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

const SavingsCalculator = () => {
  const [employeeCount, setEmployeeCount] = useState(500);
  const [ceoSalary, setCeoSalary] = useState(5000000);
  const [ctoSalary, setCtoSalary] = useState(3000000);
  const [cfoSalary, setCfoSalary] = useState(2500000);
  const [cooSalary, setCooSalary] = useState(2000000);

  const totalExecComp = ceoSalary + ctoSalary + cfoSalary + cooSalary;
  const aiCost = 100000; // Annual AI executive cost
  const annualSavings = Math.max(0, totalExecComp - aiCost);
  const perEmployeeRaise = employeeCount > 0 ? annualSavings / employeeCount : 0;
  const percentageIncrease = employeeCount > 0 && totalExecComp > 0 
    ? (perEmployeeRaise / 60000) * 100 // Assuming $60k average salary
    : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD', 
      maximumFractionDigits: 0 
    }).format(value);
  };

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
                type="number"
                value={employeeCount}
                onChange={(e) => setEmployeeCount(parseInt(e.target.value) || 0)}
                className="w-24"
              />
            </div>
          </div>

          {/* Executive Salaries */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Executive Compensation
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">CEO</Label>
                <Input
                  type="number"
                  value={ceoSalary}
                  onChange={(e) => setCeoSalary(parseFloat(e.target.value) || 0)}
                  placeholder="5000000"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">CTO</Label>
                <Input
                  type="number"
                  value={ctoSalary}
                  onChange={(e) => setCtoSalary(parseFloat(e.target.value) || 0)}
                  placeholder="3000000"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">CFO</Label>
                <Input
                  type="number"
                  value={cfoSalary}
                  onChange={(e) => setCfoSalary(parseFloat(e.target.value) || 0)}
                  placeholder="2500000"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">COO</Label>
                <Input
                  type="number"
                  value={cooSalary}
                  onChange={(e) => setCooSalary(parseFloat(e.target.value) || 0)}
                  placeholder="2000000"
                />
              </div>
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