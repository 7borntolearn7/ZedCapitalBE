const express = require('express');
const router = express.Router();
const adminController = require('../Controllers/adminController'); 
const agentController = require("../Controllers/agentController");
const DashBoardController = require("../Controllers/DashBoardController");
const AccountController = require("../Controllers/accountController")
const { auth } = require("../Middlewares/auth");

router.post("/createAdmin",auth,  adminController.createAdmin);
router.get("/getCounts",auth,DashBoardController.getCounts);
router.get("/getAllAdmins",auth,adminController.getAllAdmins);
router.post("/login",adminController.login);
router.post("/createAgent",auth, agentController.createAgent);
router.put("/updateAgent/:id", auth, agentController.updateAgent);
router.put("/updateAgentPassword/:id",auth,agentController.updateAgentPassword);
router.get("/getAgents", auth, agentController.getAllAgents);
router.delete("/deleteAgent/:id", auth, agentController.deleteAgent);
router.post("/createAccount",auth,AccountController.createAccount);
router.put("/updateAccount/:id",auth,AccountController.updateAccount);
router.put("/updateAccountPassword/:id",auth,AccountController.updateAccountPassword);
router.delete("/deleteAccount/:userId",auth,AccountController.deleteAccount);
router.get("/getAccounts",auth,AccountController.getAccounts);
router.get("/account-alert",auth, AccountController.getAccountAlert);
router.get("/trade-account-info",auth, AccountController.getTradeAccountInfo);
router.put("/updateAlert/:id",auth,AccountController.updateAccountAlert);
router.put("/updateDeviceId/:id",auth,AccountController.updateAccountDeviceIds);


module.exports = router;
