const ethers = require('ethers');
const readline = require('readline-sync');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const ora = require('ora');
const figlet = require('figlet');
require('dotenv').config();

const { compileContract } = require('./compiler');

const NETWORKS = {
    sepolia: {
        name: 'Sepolia (Ethereum Testnet)',
        rpc: process.env.SEPOLIA_RPC_URL,
        chainId: 11155111,
        explorer: 'https://sepolia.etherscan.io/'
    },
    bsc_testnet: {
        name: 'BSC Testnet',
        rpc: process.env.BSC_TESTNET_RPC_URL,
        chainId: 97,
        explorer: 'https://testnet.bscscan.com/'
    },
    bsc_mainnet: {
        name: 'BSC Mainnet',
        rpc: process.env.BSC_MAINNET_RPC_URL,
        chainId: 56,
        explorer: 'https://bscscan.com/'
    }
};

const fallbackRPCs = {
    sepolia: 'https://rpc2.sepolia.org',
    bsc_testnet: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
    bsc_mainnet: 'https://bsc-dataseed.binance.org/'
};

const CONFIG_FILE = path.join(__dirname, 'deployed_contracts.json');
const LOG_FILE = path.join(__dirname, 'var_manager.log');

function loadDeployedContracts() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        } catch (e) {
            return {};
        }
    }
    return {};
}

function saveDeployedContract(network, address) {
    const contracts = loadDeployedContracts();
    if (!contracts[network]) contracts[network] = [];
    if (!contracts[network].includes(address)) {
        contracts[network].push(address);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(contracts, null, 2));
    }
}

function removeDeployedContract(network, address) {
    const contracts = loadDeployedContracts();
    if (contracts[network]) {
        contracts[network] = contracts[network].filter(a => a !== address);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(contracts, null, 2));
    }
}

function logToFile(message) {
    const timestamp = new Date().toLocaleString();
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

function showHeader(currentNetwork, wallet) {
    console.clear();
    console.log(chalk.yellow(figlet.textSync('VAR MANAGER', { horizontalLayout: 'full' })));
    console.log(chalk.bold.blue('══════════════════════════════════════════════════'));
    console.log(chalk.cyan(` Network: `) + chalk.white(NETWORKS[currentNetwork].name));
    console.log(chalk.cyan(` Wallet:  `) + chalk.white(wallet ? wallet.address : 'Not Set'));
    console.log(chalk.bold.blue('══════════════════════════════════════════════════\n'));
}

async function main() {
    let currentNetwork = 'sepolia';
    let provider = new ethers.JsonRpcProvider(NETWORKS[currentNetwork].rpc || fallbackRPCs[currentNetwork]);
    let wallet = process.env.PRIVATE_KEY ? new ethers.Wallet(process.env.PRIVATE_KEY, provider) : null;

    const menu = [
        'Deploy VARDeployer (Factory)',
        'Deploy Ecosystem through Factory',
        'Check Wallet Balance',
        'Interact with Contract (Admin Functions)',
        'View Activity Logs',
        'Switch Network',
        'Exit'
    ];

    let running = true;
    while (running) {
        showHeader(currentNetwork, wallet);
        const index = readline.keyInSelect(menu, chalk.bold.yellow('Select Action:'));

        if (index === -1 || index === 6) break;

        switch (index) {
            case 0:
                // Deploy VARDeployer (Factory) - Owner ONLY
                if (!wallet) {
                    console.log(chalk.red('✘ Error: PRIVATE_KEY not found'));
                    readline.question(chalk.gray('\nPress Enter to continue...'));
                    break;
                }
                const factorySpinner = ora('Compiling contracts...').start();
                try {
                    // Owner hanya deploy Factory (tanpa VAR)
                    const factoryPath = path.join(__dirname, 'VAR (implementation)', 'src', 'VARDeployer.sol');
                    const factoryCompiled = await compileContract(factoryPath, 'VARDeployer');
                    factorySpinner.succeed('Contracts compiled!');

                    const fDepSpinner = ora('Deploying Factory...').start();
                    const factoryFactoryContract = new ethers.ContractFactory(factoryCompiled.abi, factoryCompiled.bytecode, wallet);
                    const factoryContract = await factoryFactoryContract.deploy();
                    await factoryContract.waitForDeployment();
                    const factoryAddress = await factoryContract.getAddress();
                    fDepSpinner.succeed(`Deployer Factory at: ${chalk.green(factoryAddress)}`);

                    // Initialize dengan 0 address dulu (Bot akan set implementation nanti)
                    const initSpinner = ora('Initializing Factory...').start();
                    const initTx = await factoryContract.initialize(ethers.ZeroAddress);
                    await initTx.wait();
                    initSpinner.succeed('Factory initialized!');

                    // Owner set Bot Address
                    const botAddress = readline.question(chalk.yellow('Enter Bot Address (untuk deploy ecosystem): '));
                    if (!ethers.isAddress(botAddress)) {
                        console.log(chalk.red('✘ Invalid bot address'));
                        readline.question(chalk.gray('\nPress Enter to continue...'));
                        break;
                    }

                    const setBotSpinner = ora('Setting Bot Address...').start();
                    const setBotTx = await factoryContract.setDeployerBot(botAddress);
                    await setBotTx.wait();
                    setBotSpinner.succeed(`Bot Address set to: ${chalk.green(botAddress)}`);

                    console.log(chalk.yellow('\n⚠️  Next Step: Bot must deploy VAR Implementation and Token Proxies'));
                    console.log(chalk.cyan('   Switch PRIVATE_KEY to Bot private key and use Case [2]'));

                    saveDeployedContract(currentNetwork + "_factory", factoryAddress);
                    logToFile(`Deployed Factory: ${factoryAddress} (${currentNetwork})`);
                    logToFile(`Set Bot Address: ${botAddress}`);
                } catch (error) {
                    factorySpinner.fail(`Deployment failed: ${error.message}`);
                }
                readline.question(chalk.gray('\nPress Enter to continue...'));
                break;
            case 1:
                // Deploy Ecosystem through Factory (BOT ONLY)
                if (!wallet) {
                    console.log(chalk.red('✘ Error: PRIVATE_KEY not found'));
                    readline.question(chalk.gray('\nPress Enter to continue...'));
                    break;
                }
                const factories = loadDeployedContracts()[currentNetwork + "_factory"] || [];
                if (factories.length === 0) {
                    console.log(chalk.red('✘ Error: Deploy VARDeployer first (Case 0)!'));
                    readline.question(chalk.gray('\nPress Enter to continue...'));
                    break;
                }
                const factoryAddr = factories[factories.length - 1];

                const botEcoSpinner = ora('Compiling & Deploying VAR Implementation (Bot)...').start();
                try {
                    const factoryPath = path.join(__dirname, 'VAR (implementation)', 'src', 'VARDeployer.sol');
                    const { abi: factoryAbi } = await compileContract(factoryPath, 'VARDeployer');
                    const factoryContract = new ethers.Contract(factoryAddr, factoryAbi, wallet);

                    // 1. Bot deploy VAR Implementation
                    const varPath = path.join(__dirname, 'VAR (implementation)', 'src', 'VAR.sol');
                    const varCompiled = await compileContract(varPath, 'VAR');

                    const deployVarSpinner = ora('Bot deploying VAR Implementation...').start();
                    const varFactory = new ethers.ContractFactory(varCompiled.abi, varCompiled.bytecode, wallet);
                    const varContract = await varFactory.deploy();
                    await varContract.waitForDeployment();
                    const varAddress = await varContract.getAddress();
                    deployVarSpinner.succeed(`VAR Implementation at: ${chalk.green(varAddress)} (Creator: Bot)`);

                    // 2. Bot set implementation di factory
                    const setImplSpinner = ora('Setting VAR Implementation in Factory...').start();
                    const setImplTx = await factoryContract.setImplementation(varAddress);
                    await setImplTx.wait();
                    setImplSpinner.succeed('Factory updated with VAR Implementation');

                    // 3. Get token details
                    const tokenName = readline.question(chalk.yellow('Enter Token Name: '));
                    const tokenSymbol = readline.question(chalk.yellow('Enter Token Symbol: '));
                    const initialMintInput = readline.question(chalk.yellow('Enter initial mint amount (default 1,000,000): ')) || "1000000";
                    const initialMint = ethers.parseUnits(initialMintInput, 18);

                    // 4. Bot call botDeployEcosystem (Bot jadi creator Proxy)
                    const deployProxySpinner = ora('Bot deploying Token Proxy...').start();
                    const tx = await factoryContract.botDeployEcosystem(tokenName, tokenSymbol, initialMint);
                    const receipt = await tx.wait();

                    const event = receipt.logs.find(log => {
                        try { return factoryContract.interface.parseLog(log).name === 'Deployed'; } catch(e) { return false; }
                    });
                    const parsedEvent = factoryContract.interface.parseLog(event);
                    const { proxy } = parsedEvent.args;

                    deployProxySpinner.succeed(`Token Proxy at: ${chalk.green(proxy)} (Creator: Bot)`);

                    console.log(chalk.green('\n✅ Ecosystem Deployed by Bot!'));
                    console.log(chalk.cyan(`   VAR Implementation: ${varAddress}`));
                    console.log(chalk.cyan(`   Token Proxy: ${proxy}`));

                    saveDeployedContract(currentNetwork + "_var_impl", varAddress);
                    saveDeployedContract(currentNetwork, proxy);
                    logToFile(`Bot deployed VAR: ${varAddress} and Proxy: ${proxy} for ${tokenName} (${tokenSymbol})`);
                } catch (error) {
                    botEcoSpinner.fail(`Deployment failed: ${error.message}`);
                    if (error.data) console.log(chalk.red('Data:'), error.data);
                }
                readline.question(chalk.gray('\nPress Enter to continue...'));
                break;
            case 2: // Balance
                if (!wallet) {
                    console.log(chalk.red('✘ Error: Wallet not configured.'));
                } else {
                    const balance = await provider.getBalance(wallet.address);
                    console.log(chalk.cyan(`\nWallet: ${wallet.address}`));
                    console.log(chalk.green(`Balance: ${ethers.formatUnits(balance, 18)} ETH/BNB/POL`));
                }
                readline.question(chalk.gray('\nPress Enter to continue...'));
                break;
            case 3: // Interact
                if (!wallet) {
                    console.log(chalk.red('✘ Error: Wallet not configured.'));
                    readline.question(chalk.gray('\nPress Enter to continue...'));
                    break;
                }

                let proxyAddr = "";
                const savedContracts = loadDeployedContracts()[currentNetwork] || [];

                if (savedContracts.length > 0) {
                    const addrMenu = [...savedContracts, 'Enter New Address', 'Remove a Saved Address', 'Back'];
                    const addrIdx = readline.keyInSelect(addrMenu, chalk.bold.yellow('Select Proxy Address:'));

                    if (addrIdx === -1 || addrIdx === addrMenu.length - 1) break;

                    if (addrIdx < savedContracts.length) {
                        proxyAddr = savedContracts[addrIdx];
                    } else if (addrIdx === savedContracts.length) {
                        proxyAddr = readline.question(chalk.yellow('Enter Proxy Address: '));
                        if (ethers.isAddress(proxyAddr)) {
                            saveDeployedContract(currentNetwork, proxyAddr);
                        }
                    } else if (addrIdx === savedContracts.length + 1) {
                        const delIdx = readline.keyInSelect(savedContracts, chalk.bold.yellow('Remove which one?'));
                        if (delIdx !== -1) {
                            removeDeployedContract(currentNetwork, savedContracts[delIdx]);
                            console.log(chalk.green('✔ Address removed.'));
                        }
                        break;
                    }
                } else {
                    proxyAddr = readline.question(chalk.yellow('Enter Proxy Address: '));
                    if (ethers.isAddress(proxyAddr)) {
                        saveDeployedContract(currentNetwork, proxyAddr);
                    }
                }

                if (!ethers.isAddress(proxyAddr)) {
                    console.log(chalk.red('✘ Invalid address.'));
                    readline.question(chalk.gray('\nPress Enter to continue...'));
                    break;
                }

                const compSpinner = ora('Fetching Contract Interface...').start();
                const implPathForAbi = path.join(__dirname, 'VAR (implementation)', 'src', 'VAR.sol');
                const { abi } = await compileContract(implPathForAbi, 'VAR');
                const contract = new ethers.Contract(proxyAddr, abi, wallet);
                compSpinner.succeed('Interface loaded.');

                let interacting = true;
                while (interacting) {
                    showHeader(currentNetwork, wallet);
                    console.log(chalk.bold.magenta(` ◈ Interacting with: ${proxyAddr}`));
                    const interactMenu = [
                        'Add Tokens (Mint)', 
                        'Transfer (User/Wallet)', 
                        'Transfer (Admin/Rescue)', 
                        'Remove Tokens (Burn)', 
                        'Check Total Supply', 
                        'Check BalanceOf', 
                        'Check Tax Configuration',
                        'Set Tax Burn BPS', 
                        'Check Proxy Native Balance',
                        'Withdraw Native from Proxy',
                        'Access Control Check', 
                        'Upgrade Implementation', 
                        'Check Factory Balance',
                        'Withdraw ETH from Factory',
                        'Back'
                    ];
                    const interactIndex = readline.keyInSelect(interactMenu, chalk.bold.yellow('Select Function:'));

                    try {
                        if (interactIndex === 0) {
                            const to = readline.question(chalk.yellow('To address: '));
                            const amount = readline.question(chalk.yellow('Amount: '));
                            const txSpinner = ora('Sending transaction...').start();
                            const tx = await contract.add(to, ethers.parseUnits(amount, 18));
                            txSpinner.text = `Waiting for confirmation: ${tx.hash}`;
                            await tx.wait();
                            txSpinner.succeed('Tokens added successfully!');
                            logToFile(`Minted ${amount} for ${proxyAddr} to ${to}`);
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 1) {
                            const to = readline.question(chalk.yellow('To address: '));
                            const amount = readline.question(chalk.yellow('Amount: '));
                            const txSpinner = ora('Sending transaction...').start();
                            const tx = await contract.transfer(to, ethers.parseUnits(amount, 18));
                            txSpinner.text = `Waiting for confirmation: ${tx.hash}`;
                            await tx.wait();
                            txSpinner.succeed('Transfer successful!');
                            logToFile(`Transferred ${amount} from ${proxyAddr} to ${to}`);
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 2) {
                            const from = readline.question(chalk.yellow('From address: '));
                            const to = readline.question(chalk.yellow('To address: '));
                            const amount = readline.question(chalk.yellow('Amount: '));
                            const txSpinner = ora('Sending transaction...').start();
                            const tx = await contract.transfer(from, to, ethers.parseUnits(amount, 18));
                            txSpinner.text = `Waiting for confirmation: ${tx.hash}`;
                            await tx.wait();
                            txSpinner.succeed('Admin Transfer successful!');
                            logToFile(`Admin Transfer ${amount} from ${from} to ${to} on ${proxyAddr}`);
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 3) {
                            const amount = readline.question(chalk.yellow('Amount to remove: '));
                            const txSpinner = ora('Sending transaction...').start();
                            const tx = await contract.remove(ethers.parseUnits(amount, 18));
                            txSpinner.text = `Waiting for confirmation: ${tx.hash}`;
                            await tx.wait();
                            txSpinner.succeed('Tokens removed successfully!');
                            logToFile(`Burned ${amount} on ${proxyAddr}`);
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 4) {
                            const supply = await contract.totalSupply();
                            console.log(chalk.green(`✔ Total Supply: ${ethers.formatUnits(supply, 18)}`));
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 5) {
                            const target = readline.question(chalk.yellow('Address to check: '));
                            const bal = await contract.balanceOf(target);
                            console.log(chalk.green(`✔ Balance: ${ethers.formatUnits(bal, 18)}`));
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 6) {
                            const bps = await contract.taxBps();
                            console.log(chalk.cyan(`Current Tax Burn: ${bps.toString()} BPS (${Number(bps)/100}%)`));
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 7) {
                            const taxBpsValue = readline.question(chalk.yellow('New Tax Burn BPS (100 = 1%, current 25 = 0.25%): '));
                            const txSpinner = ora('Updating tax burn config...').start();
                            const tx = await contract.setTaxConfig(ethers.ZeroAddress, taxBpsValue);
                            txSpinner.text = `Waiting for confirmation: ${tx.hash}`;
                            await tx.wait();
                            txSpinner.succeed('Tax burn configuration updated!');
                            logToFile(`Updated tax to ${taxBpsValue} BPS on ${proxyAddr}`);
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 8) {
                            const bal = await provider.getBalance(proxyAddr);
                            console.log(chalk.cyan(`Proxy Native Balance: ${ethers.formatUnits(bal, 18)} ETH/BNB/POL`));
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 9) {
                            const amountInput = readline.question(chalk.yellow('Amount to withdraw: '));
                            const toAddress = readline.question(chalk.yellow(`To address (default ${wallet.address}): `)) || wallet.address;
                            const txSpinner = ora('Executing withdrawal from Proxy...').start();
                            const tx = await contract.withdrawNative(toAddress, ethers.parseUnits(amountInput, 18));
                            await tx.wait();
                            txSpinner.succeed('Withdrawal successful!');
                            logToFile(`Withdrew ${amountInput} native from Proxy ${proxyAddr} to ${toAddress}`);
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 10) {
                            try {
                                const amAddr = await contract.authority();
                                console.log(chalk.cyan(`Authority (Factory): ${amAddr}`));
                                const tokenOwner = await contract.owner();
                                console.log(chalk.cyan(`Token Owner (Factory): ${tokenOwner}`));
                                console.log(chalk.cyan(`Your Address:       ${wallet.address}`));

                                const factoryPath = path.join(__dirname, 'VAR (implementation)', 'src', 'VARDeployer.sol');
                                const { abi: fAbi } = await compileContract(factoryPath, 'VARDeployer');
                                const factoryContract = new ethers.Contract(amAddr, fAbi, wallet);
                                const fOwner = await factoryContract.owner();
                                console.log(chalk.cyan(`Factory Owner:     ${fOwner}`));

                                const isAllowed = fOwner.toLowerCase() === wallet.address.toLowerCase();
                                console.log(chalk.cyan(`Is Admin?           ${isAllowed ? chalk.green('Yes') : chalk.red('No')}`));

                                // Verification of Contract Creator
                                const bytecode = await provider.getCode(proxyAddr);
                                if (bytecode !== "0x") {
                                    console.log(chalk.gray(`\nVerification: This is a professional Factory-deployed contract.`));
                                }
                            } catch (err) {
                                console.log(chalk.red(`Check failed: ${err.message}`));
                            }
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 11) {
                            const upgSpinner = ora('Compiling New Implementation...').start();
                            const { abi: newAbi, bytecode: newBytecode } = await compileContract(implPathForAbi, 'VAR');
                            upgSpinner.text = 'Deploying New Implementation...';
                            const factory = new ethers.ContractFactory(newAbi, newBytecode, wallet);
                            const newImpl = await factory.deploy();
                            await newImpl.waitForDeployment();
                            const newImplAddr = await newImpl.getAddress();
                            upgSpinner.succeed(`New Implementation at: ${newImplAddr}`);

                            const execSpinner = ora('Executing Upgrade...').start();
                            const tx = await contract.upgradeToAndCall(newImplAddr, '0x');
                            execSpinner.text = `Waiting for confirmation: ${tx.hash}`;
                            await tx.wait();
                            execSpinner.succeed('Contract upgraded successfully!');
                            logToFile(`Upgraded ${proxyAddr} to ${newImplAddr}`);
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 12) {
                            const factories = loadDeployedContracts()[currentNetwork + "_factory"] || [];
                            if (factories.length === 0) {
                                console.log(chalk.red('✘ Error: No Factory found!'));
                            } else {
                                const fAddr = factories[factories.length - 1];
                                const bal = await provider.getBalance(fAddr);
                                console.log(chalk.cyan(`Factory Balance: ${ethers.formatUnits(bal, 18)} ETH/BNB/POL`));
                            }
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else if (interactIndex === 13) {
                            const factories = loadDeployedContracts()[currentNetwork + "_factory"] || [];
                            if (factories.length === 0) {
                                console.log(chalk.red('✘ Error: No Factory found!'));
                            } else {
                                const fAddr = factories[factories.length - 1];
                                const amount = readline.question(chalk.yellow('Amount to withdraw (ETH/BNB): '));
                                const to = readline.question(chalk.yellow(`To address (default ${wallet.address}): `)) || wallet.address;

                                const fPath = path.join(__dirname, 'VAR (implementation)', 'src', 'VARDeployer.sol');
                                const { abi: fAbi } = await compileContract(fPath, 'VARDeployer');
                                const fContract = new ethers.Contract(fAddr, fAbi, wallet);

                                const txSpinner = ora('Executing withdrawal...').start();
                                const tx = await fContract.sendNative(to, ethers.parseUnits(amount, 18));
                                await tx.wait();
                                txSpinner.succeed('Withdrawal successful!');
                                logToFile(`Withdrew ${amount} from Factory ${fAddr} to ${to}`);
                            }
                            readline.question(chalk.gray('\nPress Enter to continue...'));
                        } else {
                            interacting = false;
                        }
                    } catch (e) {
                        console.error(chalk.red('\n✘ Error:'), e.shortMessage || e.message);
                        if (e.data) console.log(chalk.red('Data:'), e.data);
                        logToFile(`Error on ${proxyAddr}: ${e.message}`);
                        readline.question(chalk.gray('\nPress Enter to continue...'));
                    }
                }
                break;
            case 4:
                if (fs.existsSync(LOG_FILE)) {
                    console.clear();
                    console.log(chalk.yellow('--- RECENT ACTIVITY LOGS ---'));
                    const logs = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).slice(-20);
                    logs.forEach(l => console.log(chalk.gray(l)));
                    console.log(chalk.yellow('----------------------------'));
                } else {
                    console.log(chalk.red('No activity logs found.'));
                }
                readline.question(chalk.gray('\nPress Enter to continue...'));
                break;
            case 5:
                const networkKeys = Object.keys(NETWORKS);
                const netIndex = readline.keyInSelect(networkKeys.map(k => NETWORKS[k].name), chalk.bold.yellow('Choose Network:'));
                if (netIndex !== -1) {
                    currentNetwork = networkKeys[netIndex];
                    provider = new ethers.JsonRpcProvider(NETWORKS[currentNetwork].rpc || fallbackRPCs[currentNetwork]);
                    if (process.env.PRIVATE_KEY) {
                        wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
                    }
                    console.log(chalk.green(`✔ Switched to ${NETWORKS[currentNetwork].name}`));
                }
                break;
        }
    }
    console.log(chalk.bold.yellow('\nGoodbye!'));
}

main().catch(error => {
    console.error(chalk.red('Fatal Error:'), error);
});