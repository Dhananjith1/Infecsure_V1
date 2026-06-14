import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Microscope, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

const schema = yup.object({
  patientId: yup.string().required('Patient/Sample ID is required').matches(/^[A-Z0-9-]+$/, 'Must contain only uppercase letters, numbers, and hyphens'),
  wardId: yup.string().required('Originating ward is required'),
  pathogenType: yup.string().required('Pathogen type is required'),
  riskCategory: yup.string().required('Risk category is required'),
  notes: yup.string().max(250, 'Notes cannot exceed 250 characters')
});

type LabFormData = {
  patientId: string;
  wardId: string;
  pathogenType: string;
  riskCategory: string;
  notes?: string;
};

export const LabEntry = () => {
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success'>('idle');

  const { register, handleSubmit, formState: { errors }, reset } = useForm<LabFormData>({
    resolver: yupResolver(schema) as any,
    mode: 'onChange'
  });

  const onSubmit = (data: LabFormData) => {
    setSubmitStatus('submitting');
    console.log('Submitting lab data:', data);
    
    // Simulate API call and anomaly engine run
    setTimeout(() => {
      setSubmitStatus('success');
      reset();
      
      // Reset toast after 5 seconds
      setTimeout(() => {
        setSubmitStatus('idle');
      }, 5000);
    }, 1500);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-3xl mx-auto pb-24">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800 flex items-center gap-2">
          <Microscope className="text-brand" size={32} />
          Lab Result Entry
        </h1>
        <p className="text-slate-500 mt-1">Log positive pathogen cultures for anomaly detection</p>
      </header>

      {/* Toast Notification */}
      {submitStatus === 'success' && (
        <div className="bg-risk-green/10 border-l-4 border-risk-green p-4 rounded-r-md flex items-start gap-3 animate-in slide-in-from-top-4 fade-in">
          <CheckCircle2 className="text-risk-green mt-0.5" size={20} />
          <div>
            <h4 className="font-bold text-risk-green">Result logged successfully</h4>
            <p className="text-sm text-slate-700 mt-1">
              Data submitted to Z-Score anomaly engine. Anomaly check is currently in progress. 
              Any flagged patterns will appear in the ICNO Validation Gate.
            </p>
          </div>
        </div>
      )}

      <Card className="shadow-sm border-slate-200">
        <CardHeader className="bg-slate-50 border-b border-slate-100">
          <CardTitle className="text-lg text-slate-800">Culture Details</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Patient/Sample ID */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Patient/Sample ID</label>
                <input 
                  {...register('patientId')}
                  placeholder="e.g. LAB-2023-001"
                  className={`w-full p-3 rounded-lg border ${errors.patientId ? 'border-risk-red focus:ring-risk-red/20' : 'border-slate-300 focus:border-brand focus:ring-brand/20'}`}
                />
                {errors.patientId && (
                  <p className="text-sm text-risk-red flex items-center gap-1 mt-1">
                    <AlertCircle size={14} /> {errors.patientId.message}
                  </p>
                )}
              </div>

              {/* Ward */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Originating Ward</label>
                <select 
                  {...register('wardId')}
                  className={`w-full p-3 rounded-lg border bg-white ${errors.wardId ? 'border-risk-red focus:ring-risk-red/20' : 'border-slate-300 focus:border-brand focus:ring-brand/20'}`}
                >
                  <option value="">Select a ward...</option>
                  <option value="ward-04">Ward 04 (General)</option>
                  <option value="ward-05">Ward 05 (Maternity)</option>
                  <option value="icu">ICU</option>
                  <option value="pediatrics">Pediatrics</option>
                </select>
                {errors.wardId && (
                  <p className="text-sm text-risk-red flex items-center gap-1 mt-1">
                    <AlertCircle size={14} /> {errors.wardId.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pathogen Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Pathogen Type</label>
                <select 
                  {...register('pathogenType')}
                  className={`w-full p-3 rounded-lg border bg-white ${errors.pathogenType ? 'border-risk-red focus:ring-risk-red/20' : 'border-slate-300 focus:border-brand focus:ring-brand/20'}`}
                >
                  <option value="">Select pathogen...</option>
                  <option value="dengue">Dengue Virus</option>
                  <option value="mrsa">MRSA</option>
                  <option value="c-diff">Clostridium difficile</option>
                  <option value="influenza">Influenza A/B</option>
                  <option value="other">Other (Specify in notes)</option>
                </select>
                {errors.pathogenType && (
                  <p className="text-sm text-risk-red flex items-center gap-1 mt-1">
                    <AlertCircle size={14} /> {errors.pathogenType.message}
                  </p>
                )}
              </div>

              {/* Risk Category */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Initial Risk Category</label>
                <select 
                  {...register('riskCategory')}
                  className={`w-full p-3 rounded-lg border bg-white ${errors.riskCategory ? 'border-risk-red focus:ring-risk-red/20' : 'border-slate-300 focus:border-brand focus:ring-brand/20'}`}
                >
                  <option value="">Select risk category...</option>
                  <option value="routine">Routine / Low</option>
                  <option value="moderate">Moderate / Watch</option>
                  <option value="critical">Critical / Isolation Required</option>
                </select>
                {errors.riskCategory && (
                  <p className="text-sm text-risk-red flex items-center gap-1 mt-1">
                    <AlertCircle size={14} /> {errors.riskCategory.message}
                  </p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Additional Notes (Optional)</label>
              <textarea 
                {...register('notes')}
                rows={3}
                placeholder="Any additional context about the sample..."
                className={`w-full p-3 rounded-lg border ${errors.notes ? 'border-risk-red focus:ring-risk-red/20' : 'border-slate-300 focus:border-brand focus:ring-brand/20'}`}
              />
              {errors.notes && (
                <p className="text-sm text-risk-red flex items-center gap-1 mt-1">
                  <AlertCircle size={14} /> {errors.notes.message}
                </p>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <Button 
                type="submit" 
                size="lg" 
                className="w-full sm:w-auto min-w-[150px]"
                disabled={submitStatus === 'submitting'}
              >
                {submitStatus === 'submitting' ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                ) : (
                  'Submit Result'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};