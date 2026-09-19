# 上游来源

https://github.com/rfdiosuao/three-axes-futures-toolkit

固定版本：3ceeb2ad1e7d40f3cd779867859130ac56e0de19。MIT，许可证见LICENSE。

screen_three_axes.reference.py是未经修改的上游公式参考，不是工作台运行入口，不自动执行、不安装其Python依赖。不要将其中500万元模拟权益、1%风险或10%敞口当作用户账户设置。

工作台适配实现在integrations/three-axes.mjs：使用TqSdk实际合约，排除未完成K线，缺历史单列，不假设账户权益或合约乘数；ATR采用前收盘，不采用上游monitor_gold.py的结算价回退。该参考模块与五简正式规则分离。
