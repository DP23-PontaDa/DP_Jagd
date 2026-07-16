/* ==========================================
   DP_Jagd V2
   auth.js
========================================== */

const Auth = {

    async login() {

        const email = document
            .getElementById("email")
            .value
            .trim();

        const password = document
            .getElementById("password")
            .value
            .trim();

        document.getElementById("loginError").innerHTML = "";

        const { error } =
            await db.auth.signInWithPassword({

                email,
                password

            });

        if (error) {

            document.getElementById("loginError").innerHTML =
                error.message;

            return;

        }

        location.reload();

    },

    async logout() {

        await db.auth.signOut();

        location.reload();

    },

    async user() {

        const {

            data: {

                user

            }

        } = await db.auth.getUser();

        return user;

    }

};
