# Title

This repository accompanies the paper:
**"Optimizing client-side energy consumption in enterprise web applications via power profiling"**

It contains multiple versions of the **Stock: Single Material** and **Slow or Non-Moving Materials** applications used throughout the paper to measure the client-side energy consumption. They illustrate how the applications evolved with the implemented optimizations.

---

## ⚠️ Important Note

> ⚠️ **This repository is not executable.**
> The applications depend on the proprietary ABAP on-premise backend mentioned in the article, which is situated at the SAP University Competence Center in Munich, Germany. Hence, a potential user would have to login to meaningfully use the applications.
>
> The code is provided for:
> - undestanding the system design
> - comparing the different versions
> - studying implementation-level optimizations

---

## 🧭 Version Overview

Each folder represents one state of the application:

- *-ORI &#8594; Original implementation
- *-OPT1 &#8594; Dialog exchange (first optimization)
- *-OPT2 &#8594; Chart library efficiency (second optimization)
- *-OPT3 &#8594; Data projection (third optimization)

For the versions of **Slow or Non-Moving Materials**, each folder contains two separate applications, which are the Analytical List Page application and the Object Page to which the user is forwarded when selecting a specific material entry in the smart table.

## 📊 Optimization Overview 

- **ORI**
Initial implementation of the applications as downloaded from the SAPUI5 ABAP Repository. This version is currently available on the on-premise system (March 2026).

- **OPT1**
Introduces the first optimization, which is the dialog exchange. The dialogs in the applications are substituted with a custom implementation of a **sap.ui.core.Control**. Relevant files are [LightDialog.js](https://github.com/A-CF/sapui5-energy-optimization/blob/main/stock-single-material_OPT1/webapp/reuse/custom/LightDialog.js), [HistoryChartLight.js](https://github.com/A-CF/sapui5-energy-optimization/blob/main/stock-single-material_OPT1/webapp/reuse/custom/HistoryChartLight.js), [ChartPersonalizationLight.js](https://github.com/A-CF/sapui5-energy-optimization/blob/main/stock-single-material_OPT1/webapp/reuse/custom/ChartPersonalizationLight.js) for **Stock - Single Material** and [CustomExportDialog.js](https://github.com/A-CF/sapui5-energy-optimization/blob/main/slow-or-non-moving-materials_OPT1/opt1_ALP/webapp/ext/controls/CustomExportDialog.js), [CustomValueHelpDialog.js](https://github.com/A-CF/sapui5-energy-optimization/blob/main/slow-or-non-moving-materials_OPT1/opt1_ALP/webapp/ext/controls/CustomValueHelpDialog.js), and [CustomValueHelpDialogSingle.js](https://github.com/A-CF/sapui5-energy-optimization/blob/main/slow-or-non-moving-materials_OPT1/opt1_ALP/webapp/ext/controls/CustomValueHelpDialogSingle.js) for **Slow or Non-Moving Materials**.

- **OPT2**
Aims at the second optimization, the canvas-based charts. The DOM-based charts used in the applications are replaced by canvas-based charts using [Chart.js](https://github.com/chartjs).
Relevant files are [HistoryChartLight.js](https://github.com/A-CF/sapui5-energy-optimization/blob/main/stock-single-material_OPT1/webapp/reuse/custom/HistoryChartLight.js) for **Stock - Single Material** and [AnalyticalListPageExt.controller.js](https://github.com/A-CF/sapui5-energy-optimization/blob/main/slow-or-non-moving-materials_OPT2/opt2_ALP/webapp/ext/controller/AnalyticalListPageExt.controller.js) for **Slow or Non-Moving Materials**.

- **OPT3**
The version aiming at data projection.

---

## 🔬 Mapping in the Paper

| Version | Section |
| ---- | ---- |
| ORI | Sec. 4.1 |
| OPT1 | Sec. 4.2 |
| OPT2 | Sec. 4.3 |
| OPT3 | Sec. 4.4 |
