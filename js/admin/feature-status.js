// DB enabled만으로 미구현 기능을 켤 수 없다.
export const FEATURE_STATUS = Object.freeze({
  guidedKpiSetup: "preview",
  measurementQuality: "preview", surveyVersioning: "preview",
  ageSurveyTemplates: "planned", competencyProfile: "preview", standardComparisons: "preview",
});
export const featureStatus = key => FEATURE_STATUS[key] || "ready";
export const FEATURE_DEPENDENCIES = Object.freeze({ageSurveyTemplates:["surveyVersioning"],competencyProfile:["measurementQuality"],standardComparisons:["surveyVersioning","measurementQuality"]});
