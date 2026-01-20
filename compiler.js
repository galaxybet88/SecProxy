const fs = require('fs');
const path = require('path');
const solc = require('solc');

function findImports(importPath) {
    let actualPath = '';
    
    if (importPath.startsWith('@openzeppelin/contracts-upgradeable/')) {
        const relativePath = importPath.replace('@openzeppelin/contracts-upgradeable/', '');
        actualPath = path.resolve(__dirname, 'VAR (implementation)', 'lib', 'openzeppelin-contracts-upgradeable', 'contracts', relativePath);
    } else if (importPath.startsWith('@openzeppelin/contracts/')) {
        const relativePath = importPath.replace('@openzeppelin/contracts/', '');
        const baseDir = path.resolve(__dirname, 'VAR (implementation)', 'lib', 'openzeppelin-contracts');
        const potentialPaths = [
            path.resolve(baseDir, 'contracts', relativePath),
            path.resolve(baseDir, relativePath),
            path.resolve(__dirname, 'VARProxy', 'lib', 'openzeppelin-contracts', 'contracts', relativePath),
            path.resolve(__dirname, 'node_modules', '@openzeppelin', 'contracts', relativePath)
        ];
        
        for (const p of potentialPaths) {
            if (fs.existsSync(p)) {
                actualPath = p;
                break;
            }
        }
        
        if (!actualPath) {
            actualPath = potentialPaths[0]; // Fallback for error message
        }
    } else if (importPath.startsWith('forge-std/')) {
        // Handle or ignore forge-std
        return { error: 'File not found' };
    } else {
        actualPath = path.resolve(__dirname, 'VAR (implementation)', 'src', importPath);
    }
    
    if (fs.existsSync(actualPath)) {
        return { contents: fs.readFileSync(actualPath, 'utf8') };
    }
    return { error: 'File not found: ' + actualPath };
}

async function compileContract(contractPath, contractName) {
    const source = fs.readFileSync(contractPath, 'utf8');
    const input = {
        language: 'Solidity',
        sources: { [path.basename(contractPath)]: { content: source } },
        settings: {
            optimizer: { enabled: true, runs: 200 },
            outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } }
        }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
    
    if (output.errors) {
        output.errors.forEach(err => console.error(err.formattedMessage));
        if (output.errors.some(err => err.severity === 'error')) {
            throw new Error('Compilation failed');
        }
    }

    const contract = output.contracts[path.basename(contractPath)][contractName];
    return {
        abi: contract.abi,
        bytecode: contract.evm.bytecode.object
    };
}

module.exports = { compileContract };
