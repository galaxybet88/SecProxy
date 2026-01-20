// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.2.0
pragma solidity =0.8.26;

import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { AccessManagedUpgradeable } from
    "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC20PermitUpgradeable } from
    "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import { SignatureChecker } from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
/*
 * @title VAR
 * @notice The VAR token contract.
 * @dev The inheritance from OwnableUpgradeable is only used to provide the owner() function, which is required for the CCIP/CCT integration.
 *  However, all permissions and access control will be fully managed by the authority
 */

contract VAR is
    Initializable,
    ERC20Upgradeable,
    OwnableUpgradeable,
    AccessManagedUpgradeable,
    ERC20PermitUpgradeable,
    UUPSUpgradeable
{
    using SignatureChecker for address;

    address public taxWallet;
    uint256 public taxBps; // 10000 = 100%, 25 = 0.25%

    bytes32 private constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    /*
     * @dev Emitted when the permit signature is invalid.
     * @param owner The owner of the token.
     * @param signature The signature.
     */
    error ERC2612InvalidSignature(address owner, bytes signature);

    error ZeroInitialAuthority();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /*
     * @dev Initializes the contract.
     * @param initialAuthority The initial authority to set.
     * @param initialMint The initial amount to mint.
     */
    function initialize(string memory name_, string memory symbol_, address initialAuthority, uint initialMint) public initializer {
        __ERC20_init(name_, symbol_);
        if (initialAuthority == address(0)) {
            revert ZeroInitialAuthority();
        }
        __AccessManaged_init(initialAuthority);
        __ERC20Permit_init(name_);
        __UUPSUpgradeable_init();
        __Ownable_init(initialAuthority); // Initial authority (Factory) is the owner
        
        taxWallet = msg.sender;
        taxBps = 25; // 0.25%
        
        _mint(msg.sender, initialMint);
    }

    function setTaxConfig(address _taxWallet, uint256 _taxBps) external restricted {
        require(_taxBps <= 500, "Tax too high"); // Max 5% safety limit
        taxWallet = _taxWallet;
        taxBps = _taxBps;
    }

    // Treasury functions for native tokens
    receive() external payable {}
    
    function withdrawNative(address payable to, uint256 amount) external restricted {
        require(address(this).balance >= amount, "Insufficient balance");
        (bool success, ) = to.call{value: amount}("");
        require(success, "Transfer failed");
    }

    function _update(address from, address to, uint256 amount) internal override {
        super._update(from, to, amount);
    }

    /*
     * @dev Permits a spender to spend tokens on behalf of an owner.
     * @param owner The owner of the tokens.
     * @param spender The spender of the tokens.
     * @param value The amount of tokens to permit.
     * @param deadline The deadline for the permit.
     * @param signature The signature of the permit.
     */
    function permit(address owner, address spender, uint value, uint deadline, bytes calldata signature) public {
        if (block.timestamp > deadline) {
            revert ERC2612ExpiredSignature(deadline);
        }

        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, _useNonce(owner), deadline));

        bytes32 hash = _hashTypedDataV4(structHash);

        if (!owner.isValidSignatureNow(hash, signature)) {
            revert ERC2612InvalidSignature(owner, signature);
        }

        _approve(owner, spender, value);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (taxBps > 0 && msg.sender != owner() && to != owner()) {
            uint256 taxAmount = (amount * taxBps) / 10000;
            if (taxAmount > 0) {
                super._update(msg.sender, address(0), taxAmount); // Burn tokens
                amount -= taxAmount;
            }
        }
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (taxBps > 0 && from != owner() && to != owner()) {
            uint256 taxAmount = (amount * taxBps) / 10000;
            if (taxAmount > 0) {
                super._update(from, address(0), taxAmount); // Burn tokens
                amount -= taxAmount;
            }
        }
        return super.transferFrom(from, to, amount);
    }

    /*
     * @dev Transfer tokens from one address to another by admin.
     * @dev Can only be called by accounts with the `restricted` modifier.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param amount The amount of tokens to be transferred.
     */
    function transfer(address from, address to, uint amount) external restricted {
        _transfer(from, to, amount);
    }

    /*
     * @dev Mint tokens to an address.
     * @dev Can only be called by accounts with the `restricted` modifier.
     * @param to The address to mint tokens to.
     * @param amount The amount of tokens to mint.
     */
    function add(address to, uint amount) external restricted {
        _mint(to, amount);
    }

    function remove(uint amount) external restricted {
        _burn(msg.sender, amount);
    }

    /* solhint-disable no-empty-blocks */
    /*
     * @inheritdoc UUPSUpgradeable
     */
    /*
     * @dev Internal function to authorize contract upgrades.
     * This function overrides the parent implementation and applies the `restricted` modifier,
     * ensuring that only authorized accounts can perform upgrades.
     * @param address The address of the new implementation (unused in this override).
     */
    function _authorizeUpgrade(
        address
    ) internal override restricted { }
}
