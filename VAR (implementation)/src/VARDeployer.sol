// SPDX-License-Identifier: MIT
pragma solidity =0.8.26;

import { VAR } from "./VAR.sol";
import { VARProxy } from "./VARProxy.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract VARDeployer is Initializable, OwnableUpgradeable {
    address public implementation;
    address[] public allCreatedTokens;
    address public deployerBot; // Bot/Service account yang execute deployment

    event Deployed(address indexed implementation, address indexed proxy);
    event DeployerBotSet(address indexed newBot);

    function initialize(address _implementation) public initializer {
        __Ownable_init(msg.sender);
        implementation = _implementation;
        deployerBot = address(0); // Bot set later via setDeployerBot()
    }

    // ============ OWNER FUNCTIONS (Minimal interaction) ============
    // Owner set bot address untuk execute deployment
    function setDeployerBot(address _deployerBot) external onlyOwner {
        require(_deployerBot != address(0), "Invalid bot address");
        deployerBot = _deployerBot;
        emit DeployerBotSet(_deployerBot);
    }

    // ============ BOT FUNCTIONS (Ini yang execute di onchain) ============
    // Bot call ini untuk create implementation
    function botCreateImplementation() external returns (address) {
        require(msg.sender == deployerBot, "Only bot can call");
        VAR newImpl = new VAR();
        implementation = address(newImpl);
        return implementation;
    }

    // Bot call ini untuk deploy ecosystem (SEC & Proxy)
    // Sekarang Deployer (via Bot) jadi contract creator, BUKAN Owner
    function botDeployEcosystem(
        string memory name, 
        string memory symbol, 
        uint256 initialMint
    ) external returns (address) {
        require(msg.sender == deployerBot, "Only bot can call");
        require(implementation != address(0), "Implementation not set");

        // Encode initialization data untuk VAR.initialize()
        // initialAuthority = address(this) = Deployer (bukan Owner)
        bytes memory initData = abi.encodeWithSelector(
            VAR.initialize.selector,
            name,
            symbol,
            address(this), // Deployer adalah authority
            initialMint
        );

        // Deploy Proxy dengan CREATE2 untuk deterministic address
        VARProxy proxy = new VARProxy{salt: keccak256(abi.encode(allCreatedTokens.length))}(
            implementation, 
            initData
        );

        allCreatedTokens.push(address(proxy));
        emit Deployed(implementation, address(proxy));

        return address(proxy);
    }

    // ============ MAINTENANCE FUNCTIONS ============
    function setImplementation(address _implementation) external onlyOwner {
        implementation = _implementation;
    }

    function getCreatedTokensCount() external view returns (uint256) {
        return allCreatedTokens.length;
    }

    function getCreatedTokens() external view returns (address[] memory) {
        return allCreatedTokens;
    }

    // Send ETH/BNB/POL to any address
    function sendNative(address payable to, uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    // IAccessManager implementation
    function canCall(
        address caller,
        address, // target
        bytes4   // selector
    ) external view returns (bool, uint32) {
        if (caller == owner()) {
            return (true, 0);
        }
        return (false, 0);
    }

    receive() external payable {}

    function rescueETH(uint256 amount) external onlyOwner {
        payable(owner()).transfer(amount);
    }
}