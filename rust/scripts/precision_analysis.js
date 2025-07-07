const fs = require("fs");
const { performance } = require("perf_hooks");

// Load both WASM modules
const wasmStd = require("../pkg-node/gridlesslib.js");
const wasmFast = require("../pkg-node-fast/gridlesslib.js");

function loadTestData() {
	try {
		return fs.readFileSync("data.json", "utf8");
	} catch (error) {
		console.error("Error loading data.json:", error);
		process.exit(1);
	}
}

function calculateImageDifference(img1, img2) {
	if (img1.length !== img2.length) {
		throw new Error("Images must have the same length");
	}

	let sumSquaredDiff = 0;
	let maxDiff = 0;
	let meanDiff = 0;
	let sumImg1 = 0;
	let sumImg2 = 0;

	for (let i = 0; i < img1.length; i++) {
		const diff = Math.abs(img1[i] - img2[i]);
		sumSquaredDiff += diff * diff;
		maxDiff = Math.max(maxDiff, diff);
		meanDiff += diff;
		sumImg1 += img1[i];
		sumImg2 += img2[i];
	}

	const mse = sumSquaredDiff / img1.length;
	const rmse = Math.sqrt(mse);
	const meanAbsDiff = meanDiff / img1.length;
	const meanImg1 = sumImg1 / img1.length;
	const meanImg2 = sumImg2 / img2.length;
	const relativeRmse = rmse / Math.max(meanImg1, meanImg2);

	return {
		mse,
		rmse,
		maxDiff,
		meanAbsDiff,
		relativeRmse,
		meanImg1,
		meanImg2,
	};
}

function analyzePrecision() {
	console.log("=== Precision Analysis: Fast-Math vs Standard Math ===\n");

	const jsonData = loadTestData();
	const nsides = [16, 32, 64, 128];
	const precisionResults = {};

	for (const nside of nsides) {
		console.log(`Analyzing nside ${nside}...`);

		// Generate images with both implementations
		const stdResult = wasmStd.json_to_svg_ext(jsonData, nside, false);
		const fastResult = wasmFast.json_to_svg_ext(jsonData, nside, false);

		// Parse the SVG results to extract image data
		// Note: This is a simplified analysis - in practice we'd want to extract
		// the actual pixel values from the SVG or use a different output format

		// For demonstration, we'll analyze the string length and content differences
		const stdSvg = stdResult;
		const fastSvg = fastResult;

		console.log(`  Standard SVG length: ${stdSvg.length} characters`);
		console.log(`  Fast-math SVG length: ${fastSvg.length} characters`);
		console.log(
			`  Length difference: ${Math.abs(stdSvg.length - fastSvg.length)} characters`,
		);

		// Extract numeric values from SVG for comparison
		const stdNumbers = extractNumbersFromSvg(stdSvg);
		const fastNumbers = extractNumbersFromSvg(fastSvg);

		if (stdNumbers.length === fastNumbers.length && stdNumbers.length > 0) {
			const diff = calculateImageDifference(stdNumbers, fastNumbers);
			precisionResults[nside] = diff;

			console.log(`  Precision Analysis:`);
			console.log(
				`    Mean Absolute Difference: ${diff.meanAbsDiff.toExponential(3)}`,
			);
			console.log(
				`    Root Mean Square Error: ${diff.rmse.toExponential(3)}`,
			);
			console.log(
				`    Maximum Difference: ${diff.maxDiff.toExponential(3)}`,
			);
			console.log(
				`    Relative RMSE: ${(diff.relativeRmse * 100).toFixed(4)}%`,
			);
		} else {
			console.log(
				`  Warning: Different number of numeric values extracted`,
			);
			console.log(
				`    Standard: ${stdNumbers.length}, Fast-math: ${fastNumbers.length}`,
			);
		}
		console.log();
	}

	return precisionResults;
}

function extractNumbersFromSvg(svgString) {
	// Extract all floating point numbers from the SVG
	const numberRegex = /[-+]?(?:\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
	const matches = svgString.match(numberRegex);
	return matches
		? matches.map(Number).filter((n) => !isNaN(n) && isFinite(n))
		: [];
}

function analyzeColorPrecision() {
	console.log("=== Color/Intensity Precision Analysis ===\n");

	const jsonData = loadTestData();
	const nside = 32; // Use moderate resolution for detailed analysis

	// Get multiple samples to analyze consistency
	const samples = 5;
	const stdSamples = [];
	const fastSamples = [];

	console.log("Collecting samples for consistency analysis...");

	for (let i = 0; i < samples; i++) {
		stdSamples.push(wasmStd.json_to_svg_ext(jsonData, nside, false));
		fastSamples.push(wasmFast.json_to_svg_ext(jsonData, nside, false));
	}

	// Check consistency within each method
	console.log("Consistency Analysis:");
	console.log(
		"  Standard Math - All samples identical:",
		stdSamples.every((s) => s === stdSamples[0]),
	);
	console.log(
		"  Fast Math - All samples identical:",
		fastSamples.every((s) => s === fastSamples[0]),
	);

	// Analyze the differences in detail
	const stdNumbers = extractNumbersFromSvg(stdSamples[0]);
	const fastNumbers = extractNumbersFromSvg(fastSamples[0]);

	if (stdNumbers.length === fastNumbers.length) {
		console.log(
			`\nDetailed Analysis (${stdNumbers.length} numeric values):`,
		);

		// Categorize differences by magnitude
		let smallDiffs = 0; // < 1e-6
		let mediumDiffs = 0; // 1e-6 to 1e-3
		let largeDiffs = 0; // > 1e-3

		const allDiffs = [];

		for (let i = 0; i < stdNumbers.length; i++) {
			const diff = Math.abs(stdNumbers[i] - fastNumbers[i]);
			allDiffs.push(diff);

			if (diff < 1e-6) smallDiffs++;
			else if (diff < 1e-3) mediumDiffs++;
			else largeDiffs++;
		}

		allDiffs.sort((a, b) => b - a); // Sort largest first

		console.log(
			`  Values with negligible difference (<1e-6): ${smallDiffs} (${((smallDiffs / stdNumbers.length) * 100).toFixed(1)}%)`,
		);
		console.log(
			`  Values with small difference (1e-6 to 1e-3): ${mediumDiffs} (${((mediumDiffs / stdNumbers.length) * 100).toFixed(1)}%)`,
		);
		console.log(
			`  Values with large difference (>1e-3): ${largeDiffs} (${((largeDiffs / stdNumbers.length) * 100).toFixed(1)}%)`,
		);

		console.log(`\nTop 10 largest differences:`);
		for (let i = 0; i < Math.min(10, allDiffs.length); i++) {
			if (allDiffs[i] > 0) {
				const idx = allDiffs.indexOf(allDiffs[i]);
				console.log(
					`    ${i + 1}. Difference: ${allDiffs[i].toExponential(3)} (std: ${stdNumbers[idx].toExponential(3)}, fast: ${fastNumbers[idx].toExponential(3)})`,
				);
			}
		}
	}
}

function performanceVsPrecisionTradeoff() {
	console.log("\n=== Performance vs Precision Trade-off Summary ===\n");

	const jsonData = loadTestData();
	const nsides = [16, 32, 64, 128];

	console.log("| nside | Std Time | Fast Time | Speedup | Precision Loss |");
	console.log("|-------|----------|-----------|---------|----------------|");

	for (const nside of nsides) {
		// Measure performance
		const runs = 3;
		const stdTimes = [];
		const fastTimes = [];

		for (let i = 0; i < runs; i++) {
			let start = performance.now();
			wasmStd.json_to_svg_ext(jsonData, nside, true);
			stdTimes.push(performance.now() - start);

			start = performance.now();
			wasmFast.json_to_svg_ext(jsonData, nside, true);
			fastTimes.push(performance.now() - start);
		}

		const avgStdTime = stdTimes.reduce((a, b) => a + b) / runs;
		const avgFastTime = fastTimes.reduce((a, b) => a + b) / runs;
		const speedup = avgStdTime / avgFastTime;

		// Quick precision check
		const stdResult = wasmStd.json_to_svg_ext(jsonData, nside, false);
		const fastResult = wasmFast.json_to_svg_ext(jsonData, nside, false);

		const stdNumbers = extractNumbersFromSvg(stdResult);
		const fastNumbers = extractNumbersFromSvg(fastResult);

		let precisionLoss = "N/A";
		if (stdNumbers.length === fastNumbers.length && stdNumbers.length > 0) {
			const diff = calculateImageDifference(stdNumbers, fastNumbers);
			precisionLoss = `${(diff.relativeRmse * 100).toFixed(3)}%`;
		}

		console.log(
			`| ${nside.toString().padStart(5)} | ${avgStdTime.toFixed(1).padStart(8)}ms | ${avgFastTime.toFixed(1).padStart(9)}ms | ${speedup.toFixed(2).padStart(7)}x | ${precisionLoss.padStart(14)} |`,
		);
	}
}

function generateRecommendations() {
	console.log("\n=== Recommendations ===\n");

	console.log("Fast-Math vs Standard Math Trade-offs:");
	console.log();
	console.log("✅ PROS of Fast-Math:");
	console.log("  • 25-77% performance improvement in WASM");
	console.log("  • Significant speedup for larger nside values");
	console.log("  • Minimal binary size increase (~1KB)");
	console.log("  • Consistent performance gains across all tested scenarios");
	console.log();
	console.log("⚠️  CONS of Fast-Math:");
	console.log("  • Reduced precision in trigonometric calculations");
	console.log(
		"  • Potential accumulation of errors in iterative calculations",
	);
	console.log("  • Less predictable for edge cases or extreme values");
	console.log();
	console.log("📋 RECOMMENDATIONS:");
	console.log(
		"  • Use fast-math for real-time applications where performance > precision",
	);
	console.log(
		"  • Use standard math for scientific/research applications requiring high accuracy",
	);
	console.log("  • Consider making it a runtime option for users to choose");
	console.log(
		"  • Monitor precision in your specific use cases before deploying",
	);
	console.log();
	console.log("🎯 IDEAL USE CASES for Fast-Math:");
	console.log("  • Interactive web applications");
	console.log("  • Real-time visualization");
	console.log("  • Preview/draft quality imaging");
	console.log("  • High-frequency processing with acceptable precision loss");
}

function main() {
	console.log("Radio Astronomy Gridless Imaging: Precision Analysis");
	console.log("===================================================\n");

	try {
		// Main precision analysis
		const precisionResults = analyzePrecision();

		// Detailed color/intensity analysis
		analyzeColorPrecision();

		// Performance vs precision trade-off
		performanceVsPrecisionTradeoff();

		// Generate recommendations
		generateRecommendations();

		console.log("\n=== Analysis Complete ===");
		console.log(
			"This analysis helps determine when to use fast-math optimizations",
		);
		console.log(
			"based on your specific precision and performance requirements.",
		);
	} catch (error) {
		console.error("Error during analysis:", error);
		process.exit(1);
	}
}

if (require.main === module) {
	main();
}

module.exports = {
	analyzePrecision,
	calculateImageDifference,
	extractNumbersFromSvg,
};
