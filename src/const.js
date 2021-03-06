const ErrCode = {
  EC_OK: 0,
  EC_INNER_ERROR: -1, //服务器内部错误
  EC_PARAMS_LOST: -2, //参数缺失
  EC_PARAMS_INVALID: -3, //参数不合法
  EC_ROUTE_DEPERATED: -4, //接口已废弃
  EC_DAO_ERROR: -5, //数据库错误

  EC_REQ_TIMEOUT: -6,
  EC_REQ_SIGN_INVALID: -7,
  EC_REQ_DUPLICATE: -8,

  EC_GENESISID_INVALID: -10001,
  EC_CONTRACT_VERIFY_FAILED: -10002,
  EC_NFT_NOT_EXISTED: -10003,
};

module.exports = {
  ErrCode,
};
