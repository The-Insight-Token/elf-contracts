import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, waffle } from "hardhat";
import { ERC20Permit__factory } from "typechain/factories/ERC20Permit__factory";
import { IERC20__factory } from "typechain/factories/IERC20__factory";
import { Vault__factory } from "typechain/factories/Vault__factory";
import { ZapSwapCurveToken__factory } from "typechain/factories/ZapSwapCurveToken__factory";
import {
  ZapInStruct,
  ZapOutStruct,
  ZapSwapCurveToken,
  PermitDataStruct,
} from "typechain/ZapSwapCurveToken";
import { _ETH_CONSTANT } from "./helpers/constants";
import { setBlock } from "./helpers/forking";
import manipulateTokenBalance, {
  ContractLanguage,
} from "./helpers/manipulateTokenBalance";
import { calcBigNumberPercentage } from "./helpers/math";
import { getPermitSignature } from "./helpers/signatures";
import { createSnapshot, restoreSnapshot } from "./helpers/snapshots";
import { ONE_HOUR_IN_SECONDS } from "./helpers/time";

const { provider } = waffle;

const ZAP_BLOCK = 13583600;

const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const _3CRV = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const _3CRV_POOL = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";

const LUSD = "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0";
const LUSD3CRV = "0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA";
const LUSD3CRV_POOL = "0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA";
const EP_CURVELUSD = "0xa2b3d083AA1eaa8453BfB477f062A208Ed85cBBF";

const STETH = "0xae7ab96520de3a18e5e111b5eaab095312d7fe84";
const STCRV = "0x06325440D014e39736583c165C2963BA99fAf14E";
const STCRV_POOL = "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022";
const EP_CRVSTETH = "0x2361102893CCabFb543bc55AC4cC8d6d0824A67E";

const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const CRVTRICRYPTO = "0xc4AD29ba4B3c580e6D59105FFf484999997675Ff";
const CRVTRICRYPTO_POOL = "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46";
const EP_CRV3CRYPTO = "0x285328906D0D33cb757c1E471F5e2176683247c2";

enum _3CRV_TOKEN_IDX {
  DAI = 0,
  USDC = 1,
  USDT = 2,
}

export async function deploy(user: { user: Signer; address: string }) {
  const [authSigner] = await ethers.getSigners();

  const balancerVault = Vault__factory.connect(
    "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    user.user
  );

  const deployer = new ZapSwapCurveToken__factory(authSigner);
  const zapSwapCurveToken = await deployer.deploy(balancerVault.address);

  await zapSwapCurveToken.connect(authSigner).authorize(authSigner.address);
  await zapSwapCurveToken.connect(authSigner).setOwner(authSigner.address);

  const tokensAndSpenders: { token: string; spender: string }[] = [
    { token: DAI, spender: _3CRV_POOL },
    { token: USDC, spender: _3CRV_POOL },
    { token: USDT, spender: _3CRV_POOL },
    { token: DAI, spender: zapSwapCurveToken.address },
    { token: USDC, spender: zapSwapCurveToken.address },
    { token: USDT, spender: zapSwapCurveToken.address },

    //{ token: _3CRV, spender: _3CRV_POOL },
    { token: _3CRV, spender: LUSD3CRV_POOL },
    { token: LUSD, spender: LUSD3CRV_POOL },
    { token: _3CRV, spender: zapSwapCurveToken.address },
    { token: LUSD, spender: zapSwapCurveToken.address },
    { token: LUSD3CRV, spender: balancerVault.address },
    { token: EP_CURVELUSD, spender: balancerVault.address },

    { token: STETH, spender: zapSwapCurveToken.address },
    { token: STETH, spender: STCRV_POOL },
    { token: STCRV, spender: STCRV_POOL },
    { token: STCRV, spender: balancerVault.address },
    { token: EP_CRVSTETH, spender: balancerVault.address },

    { token: WBTC, spender: CRVTRICRYPTO_POOL },
    { token: USDT, spender: CRVTRICRYPTO_POOL },
    { token: WETH, spender: CRVTRICRYPTO_POOL },
    { token: CRVTRICRYPTO, spender: balancerVault.address },
    { token: EP_CRV3CRYPTO, spender: balancerVault.address },
  ];

  const tokens = tokensAndSpenders.map(({ token }) => token);
  const spenders = tokensAndSpenders.map(({ spender }) => spender);
  await zapSwapCurveToken.setApprovalsFor(
    tokens,
    spenders,
    spenders.map(() => ethers.constants.MaxUint256)
  );

  await Promise.all(
    [
      DAI,
      USDC,
      USDT,
      _3CRV,
      LUSD,
      EP_CURVELUSD,
      STETH,
      EP_CRVSTETH,
      WBTC,
      WETH,
      EP_CRV3CRYPTO,
    ].map((token) =>
      IERC20__factory.connect(token, user.user).approve(
        zapSwapCurveToken.address,
        ethers.constants.MaxUint256
      )
    )
  );
  return { zapSwapCurveToken };
}

const DEADLINE = Math.round(Date.now() / 1000) + ONE_HOUR_IN_SECONDS;

describe("ZapSwapCurveToken", () => {
  let users: { user: Signer; address: string }[];

  let initBlock: number;
  let zapSwapCurveToken: ZapSwapCurveToken;

  before(async () => {
    initBlock = await provider.getBlockNumber();
    await createSnapshot(provider);
    // Do not change block as dependencies might change
    await setBlock(ZAP_BLOCK);

    users = ((await ethers.getSigners()) as Signer[]).map((user) => ({
      user,
      address: "",
    }));

    await Promise.all(
      users.map(async (userInfo) => {
        const { user } = userInfo;
        userInfo.address = await user.getAddress();
      })
    );

    ({ zapSwapCurveToken } = await deploy(users[1]));
  });

  after(async () => {
    await restoreSnapshot(provider);
    setBlock(initBlock);
  });

  beforeEach(async () => {
    await createSnapshot(provider);
  });
  afterEach(async () => {
    await restoreSnapshot(provider);
  });

  describe("ETH:STETH <-> ePyvcrvSTETH", () => {
    const balancerPoolId =
      "0xb03c6b351a283bc1cd26b9cf6d7b0c4556013bdb0002000000000000000000ab";

    it("should swap ETH for ePyvcrvSTETH", async () => {
      const amount = ethers.utils.parseEther("10");

      const zap: ZapInStruct = {
        pool: STCRV_POOL,
        poolToken: STCRV,
        amounts: [amount, ethers.constants.Zero],
        tokens: [_ETH_CONSTANT, STETH],
        minAmount: 0,
        balancerPoolId,
        principalToken: EP_CRVSTETH,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapIn(zap);
      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.2);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapIn({ ...zap, minAmount: lowerBound }, [], {
          value: amount,
        });

      const output = await IERC20__factory.connect(
        EP_CRVSTETH,
        provider
      ).balanceOf(users[1].address);

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap ePyvcrvSTETH for ETH", async () => {
      const amount = ethers.utils.parseEther("100");

      const userPreBalance = await provider.getBalance(users[1].address);

      await IERC20__factory.connect(EP_CRVSTETH, users[1].user).approve(
        zapSwapCurveToken.address,
        ethers.constants.MaxUint256
      );
      await manipulateTokenBalance(
        EP_CRVSTETH,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapOutStruct = {
        pool: STCRV_POOL,
        poolToken: STCRV,
        amountPrincipalToken: amount,
        balancerPoolId,
        principalToken: EP_CRVSTETH,
        deadline: DEADLINE,
        token: _ETH_CONSTANT,
        tokenIdx: 0,
        isSigUint256: false,
        minAmountToken: 0,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapOut(zap);
      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.75);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      const tx = await zapSwapCurveToken
        .connect(users[1].user)
        .zapOut({ ...zap, minAmountToken: lowerBound }, []);

      const { gasUsed, effectiveGasPrice } = await tx.wait();
      const ethUsedAsGas = gasUsed.mul(effectiveGasPrice);
      const userPostBalance = await provider.getBalance(users[1].address);

      const output = userPostBalance.sub(userPreBalance.sub(ethUsedAsGas));
      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap STETH for ePyvcrvSTETH", async () => {
      const amount = ethers.utils.parseEther("100");

      await manipulateTokenBalance(
        STETH,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapInStruct = {
        pool: STCRV_POOL,
        poolToken: STCRV,
        amounts: [ethers.constants.Zero, amount],
        tokens: [_ETH_CONSTANT, STETH],
        minAmount: 0,
        balancerPoolId,
        principalToken: EP_CRVSTETH,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapIn(zap);
      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.2);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapIn({ ...zap, minAmount: lowerBound }, []);

      const output = await IERC20__factory.connect(
        EP_CRVSTETH,
        provider
      ).balanceOf(users[1].address);

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap ePyvcrvSTETH for STETH", async () => {
      const amount = ethers.utils.parseEther("100");

      await manipulateTokenBalance(
        EP_CRVSTETH,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapOutStruct = {
        pool: STCRV_POOL,
        poolToken: STCRV,
        amountPrincipalToken: amount,
        balancerPoolId,
        principalToken: EP_CRVSTETH,
        deadline: DEADLINE,
        token: STETH,
        tokenIdx: 1,
        isSigUint256: false,
        minAmountToken: 0,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapOut(zap);
      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.75);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapOut({ ...zap, minAmountToken: lowerBound }, []);

      const output = await IERC20__factory.connect(STETH, provider).balanceOf(
        users[1].address
      );

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap ETH & STETH for ePyvcrvSTETH", async () => {
      const amount = ethers.utils.parseEther("100");

      await manipulateTokenBalance(
        STETH,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapInStruct = {
        pool: STCRV_POOL,
        poolToken: STCRV,
        amounts: [amount, amount],
        tokens: [_ETH_CONSTANT, STETH],
        minAmount: 0,
        balancerPoolId,
        principalToken: EP_CRVSTETH,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapIn(zap);
      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.2);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapIn({ ...zap, minAmount: lowerBound }, [], {
          value: amount,
        });

      const output = await IERC20__factory.connect(
        EP_CRVSTETH,
        provider
      ).balanceOf(users[1].address);

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });
  });

  describe.only("LUSD:3Crv:DAI:USDC:USDT <-> ePyvCurveLUSD", () => {
    const balancerPoolId =
      "0x893b30574bf183d69413717f30b17062ec9dfd8b000200000000000000000061";
    it("should swap DAI for ePyvCurveLUSD", async () => {
      const amount = ethers.utils.parseEther("5000");

      await manipulateTokenBalance(
        DAI,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapInStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amounts: [ethers.constants.Zero, ethers.constants.Zero],
        tokens: [LUSD, _3CRV],
        minAmount: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const _3CrvTokenAmounts = [
        amount,
        ethers.constants.Zero,
        ethers.constants.Zero,
      ];
      const estimatedOutput = await zapSwapCurveToken.estimateSwap3CrvAndZapIn(
        zap,
        _3CrvTokenAmounts
      );
      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .swap3CrvAndZapIn(
          { ...zap, minAmount: lowerBound },
          _3CrvTokenAmounts,
          []
        );
      const output = await IERC20__factory.connect(
        EP_CURVELUSD,
        provider
      ).balanceOf(users[1].address);

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap ePyvCurveLUSD for DAI", async () => {
      const amount = ethers.utils.parseEther("5000");

      await manipulateTokenBalance(
        EP_CURVELUSD,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapOutStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amountPrincipalToken: amount,
        token: _3CRV,
        tokenIdx: 1,
        isSigUint256: false,
        minAmountToken: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapOutAndSwap3Crv(
        zap,
        _3CRV_TOKEN_IDX.DAI
      );
      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapOutAndSwap3Crv(
          { ...zap, minAmountToken: lowerBound },
          _3CRV_TOKEN_IDX.DAI,
          []
        );

      const output = await IERC20__factory.connect(DAI, provider).balanceOf(
        users[1].address
      );

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap USDC for ePyvCurveLUSD", async () => {
      const amount = ethers.utils.parseUnits("5000", 8);

      await manipulateTokenBalance(
        USDC,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapInStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amounts: [ethers.constants.Zero, ethers.constants.Zero],
        tokens: [LUSD, _3CRV],
        minAmount: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const _3CrvTokenAmounts = [
        ethers.constants.Zero,
        amount,
        ethers.constants.Zero,
      ];
      const estimatedOutput = await zapSwapCurveToken.estimateSwap3CrvAndZapIn(
        zap,
        _3CrvTokenAmounts
      );
      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .swap3CrvAndZapIn(
          { ...zap, minAmount: lowerBound },
          _3CrvTokenAmounts,
          []
        );
      const output = await IERC20__factory.connect(
        EP_CURVELUSD,
        provider
      ).balanceOf(users[1].address);

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap ePyvCurveLUSD for USDC", async () => {
      const amount = ethers.utils.parseEther("5000");

      await manipulateTokenBalance(
        EP_CURVELUSD,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapOutStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amountPrincipalToken: amount,
        token: _3CRV,
        tokenIdx: 1,
        isSigUint256: false,
        minAmountToken: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapOutAndSwap3Crv(
        zap,
        _3CRV_TOKEN_IDX.USDC
      );

      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapOutAndSwap3Crv(
          { ...zap, minAmountToken: lowerBound },
          _3CRV_TOKEN_IDX.USDC,
          []
        );

      const output = await IERC20__factory.connect(USDC, provider).balanceOf(
        users[1].address
      );

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap USDT for ePyvCurveLUSD", async () => {
      const amount = ethers.utils.parseUnits("5000", 6);

      await manipulateTokenBalance(
        USDT,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapInStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amounts: [ethers.constants.Zero, ethers.constants.Zero],
        tokens: [LUSD, _3CRV],
        minAmount: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const _3CrvTokenAmounts = [
        ethers.constants.Zero,
        ethers.constants.Zero,
        amount,
      ];
      const estimatedOutput = await zapSwapCurveToken.estimateSwap3CrvAndZapIn(
        zap,
        _3CrvTokenAmounts
      );
      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .swap3CrvAndZapIn(
          { ...zap, minAmount: lowerBound },
          _3CrvTokenAmounts,
          []
        );
      const output = await IERC20__factory.connect(
        EP_CURVELUSD,
        provider
      ).balanceOf(users[1].address);

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap ePyvCurveLUSD for USDC", async () => {
      const amount = ethers.utils.parseEther("5000");

      await manipulateTokenBalance(
        EP_CURVELUSD,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapOutStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amountPrincipalToken: amount,
        token: _3CRV,
        tokenIdx: 1,
        isSigUint256: false,
        minAmountToken: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapOutAndSwap3Crv(
        zap,
        _3CRV_TOKEN_IDX.USDT
      );

      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapOutAndSwap3Crv(
          { ...zap, minAmountToken: lowerBound },
          _3CRV_TOKEN_IDX.USDC,
          []
        );

      const output = await IERC20__factory.connect(USDC, provider).balanceOf(
        users[1].address
      );

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap LUSD for ePyvCurveLUSD", async () => {
      const amount = ethers.utils.parseEther("5000");

      await manipulateTokenBalance(
        LUSD,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapInStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amounts: [amount, ethers.constants.Zero],
        tokens: [LUSD, _3CRV],
        minAmount: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapIn(zap);

      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapIn({ ...zap, minAmount: lowerBound }, []);

      const output = await IERC20__factory.connect(
        EP_CURVELUSD,
        provider
      ).balanceOf(users[1].address);

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should permit & swap LUSD for ePyvCurveLUSD", async () => {
      const amount = ethers.utils.parseEther("5000");

      (
        await IERC20__factory.connect(LUSD, users[1].user).approve(
          zapSwapCurveToken.address,
          ethers.constants.Zero
        )
      ).wait(1);

      await manipulateTokenBalance(
        LUSD,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const { v, r, s } = await getPermitSignature(
        ERC20Permit__factory.connect(LUSD, users[1].user),
        users[1].address,
        zapSwapCurveToken.address,
        ethers.constants.MaxUint256,
        "1"
      );

      const tokenPermitData: PermitDataStruct = {
        v,
        r,
        s,
        tokenContract: LUSD,
        spender: zapSwapCurveToken.address,
        expiration: ethers.constants.MaxUint256,
        amount: ethers.constants.MaxUint256,
      };

      const zap: ZapInStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amounts: [amount, ethers.constants.Zero],
        tokens: [LUSD, _3CRV],
        minAmount: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapIn(zap);

      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapIn({ ...zap, minAmount: lowerBound }, [tokenPermitData]);

      const output = await IERC20__factory.connect(
        EP_CURVELUSD,
        provider
      ).balanceOf(users[1].address);

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap ePyvCurveLUSD for LUSD", async () => {
      const amount = ethers.utils.parseEther("5000");

      await manipulateTokenBalance(
        EP_CURVELUSD,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapOutStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amountPrincipalToken: amount,
        token: LUSD,
        tokenIdx: 0,
        isSigUint256: false,
        minAmountToken: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapOut(zap);

      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapOut({ ...zap, minAmountToken: lowerBound }, []);

      const output = await IERC20__factory.connect(LUSD, provider).balanceOf(
        users[1].address
      );

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should permit & swap ePyvCurveLUSD for LUSD", async () => {
      const amount = ethers.utils.parseEther("5000");

      (
        await IERC20__factory.connect(EP_CURVELUSD, users[1].user).approve(
          zapSwapCurveToken.address,
          ethers.constants.Zero
        )
      ).wait(1);

      await manipulateTokenBalance(
        EP_CURVELUSD,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const { v, r, s } = await getPermitSignature(
        ERC20Permit__factory.connect(EP_CURVELUSD, users[1].user),
        users[1].address,
        zapSwapCurveToken.address,
        ethers.constants.MaxUint256,
        "1",
        1
      );

      const tokenPermitData: PermitDataStruct = {
        v,
        r,
        s,
        tokenContract: EP_CURVELUSD,
        spender: zapSwapCurveToken.address,
        expiration: ethers.constants.MaxUint256,
        amount: ethers.constants.MaxUint256,
      };

      const zap: ZapOutStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amountPrincipalToken: amount,
        token: LUSD,
        tokenIdx: 0,
        isSigUint256: false,
        minAmountToken: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapOut(zap);

      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapOut({ ...zap, minAmountToken: lowerBound }, [tokenPermitData]);

      const output = await IERC20__factory.connect(LUSD, provider).balanceOf(
        users[1].address
      );

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap 3CRV for ePyvCurveLUSD", async () => {
      const amount = ethers.utils.parseEther("5000");

      await manipulateTokenBalance(
        _3CRV,
        ContractLanguage.Vyper,
        amount,
        users[1].address
      );

      const zap: ZapInStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amounts: [ethers.constants.Zero, amount],
        tokens: [LUSD, _3CRV],
        minAmount: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapIn(zap);

      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapIn({ ...zap, minAmount: lowerBound }, []);

      const output = await IERC20__factory.connect(
        EP_CURVELUSD,
        provider
      ).balanceOf(users[1].address);

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });

    it("should swap ePyvCurveLUSD for 3CRV", async () => {
      const amount = ethers.utils.parseEther("5000");

      await manipulateTokenBalance(
        EP_CURVELUSD,
        ContractLanguage.Solidity,
        amount,
        users[1].address
      );

      const zap: ZapOutStruct = {
        pool: LUSD3CRV_POOL,
        poolToken: LUSD3CRV,
        amountPrincipalToken: amount,
        token: _3CRV,
        tokenIdx: 1,
        isSigUint256: false,
        minAmountToken: 0,
        balancerPoolId,
        principalToken: EP_CURVELUSD,
        deadline: DEADLINE,
      };

      const estimatedOutput = await zapSwapCurveToken.estimateZapOut(zap);

      const slippageOffset = calcBigNumberPercentage(estimatedOutput, 0.075);
      const lowerBound = estimatedOutput.sub(slippageOffset);
      const upperBound = estimatedOutput.add(slippageOffset);

      await zapSwapCurveToken
        .connect(users[1].user)
        .zapOut({ ...zap, minAmountToken: lowerBound }, []);

      const output = await IERC20__factory.connect(_3CRV, provider).balanceOf(
        users[1].address
      );

      expect(output.lt(upperBound) && output.gt(lowerBound)).to.be.true;
    });
  });
});
