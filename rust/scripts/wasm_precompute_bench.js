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

function benchmarkWasmPrecomputed() {
    console.log('WASM Precomputation Benchmark:');
    console.log('Testing performance WITH and WITHOUT precomputed hemisphere data\n');
    
    const jsonData = loadTestData();
    const nsides = [32, 64, 128];
    const numRuns = 5;
    
    // Check if precomputed directory exists
    const hasPrecomputed = fs.existsSync('precomputed/');
    
    if (hasPrecomputed) {
        console.log('=== WITH Precomputed Data ===');
        
        for (const nside of nsides) {
            const times = [];
            
            // Warmup
            for (let i = 0; i < 2; i++) {
                wasm.json_to_svg_ext(jsonData, nside, true);
            }
            
            // Benchmark runs
            for (let i = 0; i < numRuns; i++) {
                const startTime = performance.now();
                wasm.json_to_svg_ext(jsonData, nside, true);
                const endTime = performance.now();
                times.push(endTime - startTime);
            }
            
            const mean = times.reduce((a, b) => a + b, 0) / times.length;
            const min = Math.min(...times);
            const max = Math.max(...times);
            
            console.log(`  nside ${nside}: ${mean.toFixed(1)} ms (${min.toFixed(1)}-${max.toFixed(1)} ms)`);
        }
        
        console.log('\n=== Removing precomputed data for comparison ===');
        
        // Remove precomputed directory temporarily
        if (fs.existsSync('precomputed/')) {
            fs.rmSync('precomputed/', { recursive: true });
        }
        
        console.log('=== WITHOUT Precomputed Data (computed) ===');
        
        for (const nside of nsides) {
            const times = [];
            
            // Warmup
            for (let i = 0; i < 2; i++) {
                wasm.json_to_svg_ext(jsonData, nside, true);
            }
            
            // Benchmark runs
            for (let i = 0; i < numRuns; i++) {
                const startTime = performance.now();
                wasm.json_to_svg_ext(jsonData, nside, true);
                const endTime = performance.now();
                times.push(endTime - startTime);
            }
            
            const mean = times.reduce((a, b) => a + b, 0) / times.length;
            const min = Math.min(...times);
            const max = Math.max(...times);
            
            console.log(`  nside ${nside}: ${mean.toFixed(1)} ms (${min.toFixed(1)}-${max.toFixed(1)} ms)`);
        }
        
    } else {
        console.log('No precomputed data found. Run "make precompute" first to generate comparison data.');
        console.log('Running benchmark WITHOUT precomputed data:\n');
        
        for (const nside of nsides) {
            const times = [];
            
            // Warmup
            for (let i = 0; i < 2; i++) {
                wasm.json_to_svg_ext(jsonData, nside, true);
            }
            
            // Benchmark runs
            for (let i = 0; i < numRuns; i++) {
                const startTime = performance.now();
                wasm.json_to_svg_ext(jsonData, nside, true);
                const endTime = performance.now();
                times.push(endTime - startTime);
            }
            
            const mean = times.reduce((a, b) => a + b, 0) / times.length;
            const min = Math.min(...times);
            const max = Math.max(...times);
            
            console.log(`  nside ${nside}: ${mean.toFixed(1)} ms (${min.toFixed(1)}-${max.toFixed(1)} ms)`);
        }
    }
    
    console.log('\n=== WASM Precomputation Test Complete ===');
}

if (require.main === module) {
    benchmarkWasmPrecomputed();
}