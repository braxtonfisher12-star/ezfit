export function recalcMacrosForCalorieChange({ currentCalories, currentProtein, currentCarbs, currentFat, calorieChange }) {
  const newCalories = Math.max(1200, Math.round(currentCalories + calorieChange));
  const proteinKcal = currentProtein * 4;
  const remaining = Math.max(0, newCalories - proteinKcal);
  const carbFatKcalOld = currentCarbs * 4 + currentFat * 9;
  const carbShare = carbFatKcalOld > 0 ? (currentCarbs * 4) / carbFatKcalOld : 0.6;
  const newCarbs = Math.max(0, Math.round((remaining * carbShare) / 4));
  const newFat = Math.max(0, Math.round((remaining * (1 - carbShare)) / 9));
  return { calories: newCalories, protein_g: currentProtein, carbs_g: newCarbs, fat_g: newFat };
}
