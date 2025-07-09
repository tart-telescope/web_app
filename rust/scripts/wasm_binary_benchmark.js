const fs = require('fs');
const { performance } = require('perf_hooks');

// Load the WASM module
const wasm = require('../pkg-node/gridlesslib.js');

function loadTestData() {
    try {
        return fs.readFileSync('data.json', 'utf8');
    } catch (error) {
        console.error('Error loading data.json:', error);
        process.exit(1);
    }
}

function loadBinaryData(nside) {
    try {
        const binaryPath = `precomputed/hemisphere_nside_${nside}.bin`;
        if (fs.existsSync(binaryPath)) {
            return fs.readFileSync(binaryPath);
        }
        return null;
    } catch (error) {
        console.error(`Error loading binary data for nside ${nside}:`, error);
        return null;
    }
}

function loadJSONData(nside) {
    try {
        const jsonPath = `precomputed/hemisphere_nside_${nside}.json`;
        if (fs.existsSync(jsonPath)) {
            return fs.readFileSync(jsonPath, 'utf8');
        }
        return null;
    } catch (error) {
        console.error(`Error loading JSON data for nside ${nside}:`, error);
        return null;
    }
}

async function benchmarkComprehensive() {
    console.log('🚀 WASM Comprehensive Performance Benchmark');
    console.log('Comparing JSON vs Binary vs Online Generation\n');
    
    const jsonData = loadTestData();
    const nsides = [32, 64, 128];
    const numRuns = 5;
    
    const results = {};
    
    for (const nside of nsides) {
        console.log(`\n=== Testing NSIDE ${nside} ===`);
        results[nside] = {};
        
        // Load precomputed data
        const binaryData = loadBinaryData(nside);
        const jsonPrecomputed = loadJSONData(nside);
        
        console.log(`Binary data available: ${binaryData ? 'Yes' : 'No'}`);
        console.log(`JSON data available: ${jsonPrecomputed ? 'Yes' : 'No'}`);
        
        // 1. Test Online Generation (no precomputed data)
        console.log('\n1. Online Generation (compute on-the-fly):');
        const onlineTimes = [];
        
        // Warmup
        for (let i = 0; i < 2; i++) {
            wasm.json_to_svg_ext(jsonData, nside, true);
        }
        
        // Benchmark runs
        for (let i = 0; i < numRuns; i++) {
            const startTime = performance.now();
            wasm.json_to_svg_ext(jsonData, nside, true);
            const endTime = performance.now();
            onlineTimes.push(endTime - startTime);
        }
        
        const onlineAvg = onlineTimes.reduce((a, b) => a + b, 0) / onlineTimes.length;
        const onlineMin = Math.min(...onlineTimes);
        const onlineMax = Math.max(...onlineTimes);
        
        results[nside].online = {
            avg: onlineAvg,
            min: onlineMin,
            max: onlineMax,
            times: onlineTimes
        };
        
        console.log(`   Average: ${onlineAvg.toFixed(1)} ms`);
        console.log(`   Range: ${onlineMin.toFixed(1)} - ${onlineMax.toFixed(1)} ms`);
        
        // 2. Test Binary Precomputed Loading
        if (binaryData) {
            console.log('\n2. Binary Precomputed Loading:');
            const binaryTimes = [];
            
            // Warmup
            for (let i = 0; i < 2; i++) {
                wasm.binary_to_svg_with_precomputed(jsonData, nside, true, binaryData);
            }
            
            // Benchmark runs
            for (let i = 0; i < numRuns; i++) {
                const startTime = performance.now();
                wasm.binary_to_svg_with_precomputed(jsonData, nside, true, binaryData);
                const endTime = performance.now();
                binaryTimes.push(endTime - startTime);
            }
            
            const binaryAvg = binaryTimes.reduce((a, b) => a + b, 0) / binaryTimes.length;
            const binaryMin = Math.min(...binaryTimes);
            const binaryMax = Math.max(...binaryTimes);
            
            results[nside].binary = {
                avg: binaryAvg,
                min: binaryMin,
                max: binaryMax,
                times: binaryTimes,
                size: binaryData.length
            };
            
            console.log(`   Average: ${binaryAvg.toFixed(1)} ms`);
            console.log(`   Range: ${binaryMin.toFixed(1)} - ${binaryMax.toFixed(1)} ms`);
            console.log(`   File size: ${binaryData.length.toLocaleString()} bytes`);
        }
        
        // 3. Test JSON Precomputed Loading
        if (jsonPrecomputed) {
            console.log('\n3. JSON Precomputed Loading:');
            const jsonTimes = [];
            
            // Warmup
            for (let i = 0; i < 2; i++) {
                wasm.json_to_svg_with_precomputed(jsonData, nside, true, jsonPrecomputed);
            }
            
            // Benchmark runs
            for (let i = 0; i < numRuns; i++) {
                const startTime = performance.now();
                wasm.json_to_svg_with_precomputed(jsonData, nside, true, jsonPrecomputed);
                const endTime = performance.now();
                jsonTimes.push(endTime - startTime);
            }
            
            const jsonAvg = jsonTimes.reduce((a, b) => a + b, 0) / jsonTimes.length;
            const jsonMin = Math.min(...jsonTimes);
            const jsonMax = Math.max(...jsonTimes);
            
            results[nside].json = {
                avg: jsonAvg,
                min: jsonMin,
                max: jsonMax,
                times: jsonTimes,
                size: Buffer.byteLength(jsonPrecomputed, 'utf8')
            };
            
            console.log(`   Average: ${jsonAvg.toFixed(1)} ms`);
            console.log(`   Range: ${jsonMin.toFixed(1)} - ${jsonMax.toFixed(1)} ms`);
            console.log(`   File size: ${Buffer.byteLength(jsonPrecomputed, 'utf8').toLocaleString()} bytes`);
        }
        
        // 4. Test Binary Generation (generate binary on-the-fly)
        console.log('\n4. Binary Generation + Usage:');
        const binaryGenTimes = [];
        
        for (let i = 0; i < numRuns; i++) {
            const startTime = performance.now();
            
            // Generate binary data
            const generatedBinary = wasm.generate_hemisphere_data_binary(nside);
            
            // Convert JsValue to Uint8Array and then to Buffer for Node.js compatibility
            const uint8Array = new Uint8Array(generatedBinary);
            const buffer = Buffer.from(uint8Array);
            
            // Use the binary data
            wasm.binary_to_svg_with_precomputed(jsonData, nside, true, buffer);
            
            const endTime = performance.now();
            binaryGenTimes.push(endTime - startTime);
        }
        
        const binaryGenAvg = binaryGenTimes.reduce((a, b) => a + b, 0) / binaryGenTimes.length;
        const binaryGenMin = Math.min(...binaryGenTimes);
        const binaryGenMax = Math.max(...binaryGenTimes);
        
        results[nside].binaryGeneration = {
            avg: binaryGenAvg,
            min: binaryGenMin,
            max: binaryGenMax,
            times: binaryGenTimes
        };
        
        console.log(`   Average: ${binaryGenAvg.toFixed(1)} ms`);
        console.log(`   Range: ${binaryGenMin.toFixed(1)} - ${binaryGenMax.toFixed(1)} ms`);
        
        // Performance Analysis for this nside
        console.log('\n📊 Performance Analysis:');
        
        if (results[nside].binary) {
            const speedupVsOnline = results[nside].online.avg / results[nside].binary.avg;
            console.log(`   Binary vs Online: ${speedupVsOnline.toFixed(2)}x faster`);
        }
        
        if (results[nside].json) {
            const speedupJsonVsOnline = results[nside].online.avg / results[nside].json.avg;
            console.log(`   JSON vs Online: ${speedupJsonVsOnline.toFixed(2)}x faster`);
        }
        
        if (results[nside].binary && results[nside].json) {
            const speedupBinaryVsJson = results[nside].json.avg / results[nside].binary.avg;
            const compressionRatio = results[nside].json.size / results[nside].binary.size;
            console.log(`   Binary vs JSON: ${speedupBinaryVsJson.toFixed(2)}x faster`);
            console.log(`   Size reduction: ${compressionRatio.toFixed(2)}x smaller`);
        }
        
        const genVsOnline = results[nside].online.avg / results[nside].binaryGeneration.avg;
        console.log(`   Online vs Binary Generation: ${genVsOnline.toFixed(2)}x ${genVsOnline > 1 ? 'faster' : 'slower'}`);
    }
    
    // Summary Report
    console.log('\n\n🎯 COMPREHENSIVE SUMMARY REPORT');
    console.log('=====================================');
    
    console.log('\n📈 Performance Summary Table:');
    console.log('NSIDE\t| Online\t| Binary\t| JSON\t\t| BinGen');
    console.log('------|-----------|-----------|-----------|----------');
    
    for (const nside of nsides) {
        const r = results[nside];
        const online = r.online.avg.toFixed(1);
        const binary = r.binary ? r.binary.avg.toFixed(1) : 'N/A';
        const json = r.json ? r.json.avg.toFixed(1) : 'N/A';
        const binGen = r.binaryGeneration.avg.toFixed(1);
        
        console.log(`${nside}\t| ${online}ms\t| ${binary}ms\t| ${json}ms\t| ${binGen}ms`);
    }
    
    console.log('\n💾 Storage Efficiency:');
    for (const nside of nsides) {
        const r = results[nside];
        if (r.binary && r.json) {
            const compression = (r.json.size / r.binary.size).toFixed(2);
            console.log(`   NSIDE ${nside}: Binary is ${compression}x smaller than JSON`);
        }
    }
    
    console.log('\n⚡ Speed Recommendations:');
    console.log('1. 🥇 Binary Precomputed: Best performance for repeated use');
    console.log('2. 🥈 JSON Precomputed: Good performance, larger files');  
    console.log('3. 🥉 Online Generation: Slowest but no storage needed');
    console.log('4. 🔄 Binary Generation: Only use if you can\'t precompute');
    
    console.log('\n📊 Use Case Guidelines:');
    console.log('• Single use: Online generation is acceptable for small nside');
    console.log('• Repeated use: Always prefer precomputed data');
    console.log('• Storage constrained: Binary format saves significant space');
    console.log('• Network transfer: Binary format reduces bandwidth');
    console.log('• Development: JSON is human-readable for debugging');
    
    console.log('\n🏁 Benchmark Complete!');
}

if (require.main === module) {
    benchmarkComprehensive().catch(console.error);
}