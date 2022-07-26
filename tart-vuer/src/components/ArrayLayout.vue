<template>
<v-flex class="baseline" align="center" justify="center">
    <v-card class="mx-auto" flat outlined raised elevation="3" v-if="ant_sel_i">

        <v-card-title class="my-0 py-1 pr-0">
            <h4 class="teal--text text--lighten-2 text-uppercase"> Array Layout </h4>
        </v-card-title>
        <v-img aspect-ratio="1" contain>
            <svg id="overlaySVG" viewBox="0 0 512 512">
                <defs>
                    <marker id='mid' orient="auto" markerWidth='10' markerHeight='20' refX='0.1' refY='5'>
                        <!-- triangle pointing right (+x) -->
                        <path d='M0,0 V10 L5,5 Z' fill="#4db6ac" />
                    </marker>
                </defs>
                <g class="grid">

                    <circle v-for="ant_i in antennas" :key="ant_i.toString()" fill="transparent" :cx="offset+scale*ant_i[0]" :cy="offset-scale*ant_i[1]" r="12" stroke-width="1" stroke="rgb(0,0,0)" />
                    <text text-anchor="middle" dominant-baseline="middle" :x="offset+scale*0.5" :y="490">1 metre</text>
                    <path id='scaleLine' stroke-width='2.5' fill='none' stroke='black' :d="scaleLine" />
                    <path id='arrow-line' marker-mid='url(#mid)' stroke-width='3' fill='none' stroke='black' :d="line" />

                    <circle fill="white" :cx="offset+scale*ant_sel_i[0]" :cy="offset-scale*ant_sel_i[1]" :r="14" style="stroke-width:3;" stroke="teal" />
                    <circle fill="white" :cx="offset+scale*ant_sel_j[0]" :cy="offset-scale*ant_sel_j[1]" :r="14" style="stroke-width:3;" stroke="cyan" />
                    <text text-anchor="middle" dominant-baseline="middle" v-for="(ant_i, i) in antennas" :key="i.toString()+ant_i.toString()" :x="offset+scale*ant_i[0]" :y="1+offset-scale*ant_i[1]">{{i}}</text>

                </g>
            </svg>
        </v-img>
    </v-card>
</v-flex>
</template>

<script>
export default {
    name: "ArrayLayout",
    props: {},
    data: function () {
        return {
            offset: 256,
            // scale: 130,
        };
    },
    methods: {},
    computed: {
        line() {
            let x1 = parseInt(this.offset + this.scale * this.ant_sel_i[0])
            let y1 = parseInt(this.offset - this.scale * this.ant_sel_i[1])
            let x2 = parseInt(this.offset + this.scale * this.ant_sel_j[0])
            let y2 = parseInt(this.offset - this.scale * this.ant_sel_j[1])
            let xm = x1 + 0.5 * (x2 - x1).toString()
            let ym = y1 + 0.5 * (y2 - y1).toString()

            return ['M', x1, y1, "L", xm, ym, "L", x2, y2].join(' ')

        },
        scaleLine(){
            let x1 = parseInt(this.offset + this.scale * 0.)
            let y1 = parseInt(500)
            let x2 = parseInt(this.offset + this.scale * 1.)
            let y2 = parseInt(500)

            return ['M', x1, y1, "L", x2, y2].join(' ')
        },

        ant_sel_i() {
            return this.antennas[this.$store.state.selectedBaseline[0]];
        },
        ant_sel_j() {
            return this.antennas[this.$store.state.selectedBaseline[1]];
        },
        antennas() {
            return this.$store.state.antennas;
        },
        scale() {
            const ant = this.$store.state.antennas;
            let min = Math.min(...ant.map(a => a[0]), ...ant.map(a => a[1]))
            let max = Math.max(...ant.map(a => a[0]), ...ant.map(a => a[1]))
            let absMax = Math.max(-min, max)


            return Math.floor(220 / absMax)
        },


    },
};
</script>

<style scoped>
#overlaySVG {
    position: absolute;
    left: 0px;
    top: 0px;
    z-index: 2;
}
</style>
